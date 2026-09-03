import json
from fastapi import APIRouter, HTTPException, Depends, Query, Header
from typing import Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..schemas import TransactionResponse, TransactionUpdate, TransferRequest, TransferAuthorizeRequest
from .auth import get_current_user
from ..services.auth_service import verify_pin
from ..services import monnify

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("/")
def list_transactions(
    category: Optional[str] = Query(None),
    user_id: int = Depends(get_current_user),
):
    conn = get_db()
    cursor = conn.cursor()

    if category:
        cursor.execute(
            "SELECT * FROM transactions WHERE user_id = ? AND category = ? ORDER BY timestamp DESC",
            (user_id, category),
        )
    else:
        cursor.execute(
            "SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC",
            (user_id,),
        )

    rows = cursor.fetchall()
    conn.close()

    transactions = []
    for row in rows:
        tx = dict(row)
        tx["amount_display"] = f"₦{tx['amount_kobo'] / 100:,.2f}"
        transactions.append(tx)

    return {"transactions": transactions}


@router.patch("/{transaction_id}")
def update_transaction(transaction_id: int, req: TransactionUpdate, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM transactions WHERE id = ? AND user_id = ?", (transaction_id, user_id))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Transaction not found")

    if req.category:
        cursor.execute("UPDATE transactions SET category = ? WHERE id = ?", (req.category, transaction_id))
        conn.commit()

    conn.close()
    return {"message": "Transaction updated"}


def _resolve_destination_name(cursor, req, user_id) -> str:
    """Return the verified beneficiary name for Monnify (destinationAccountName).

    Prefers a saved beneficiary's verified full name; otherwise resolves the
    account via Monnify when bank details are supplied (live mode).
    """
    if req.account_number and req.bank_code:
        cursor.execute(
            "SELECT full_name FROM beneficiaries WHERE user_id = ? AND account_number = ? AND bank_code = ?",
            (user_id, req.account_number, req.bank_code),
        )
        row = cursor.fetchone()
        if row:
            return row["full_name"]
        if not monnify.DEMO_MODE and req.counterparty_name:
            try:
                verified = monnify.verify_account(req.account_number, req.bank_code)
                if verified and verified.get("account_name"):
                    return verified["account_name"]
            except Exception:
                pass
    return req.counterparty_name


@router.post("/transfer")
def create_transfer(
    req: TransferRequest,
    user_id: int = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    if not idempotency_key or len(idempotency_key) > 128:
        raise HTTPException(status_code=400, detail="A valid Idempotency-Key is required")

    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()

        cursor.execute(
            "SELECT response_json, created_at FROM idempotency_keys WHERE user_id = ? AND key = ?",
            (user_id, idempotency_key),
        )
        previous = cursor.fetchone()
        if previous:
            expires_at = datetime.fromisoformat(previous["created_at"]) + timedelta(hours=24)
            if datetime.utcnow() < expires_at:
                return json.loads(previous["response_json"])
            cursor.execute(
                "DELETE FROM idempotency_keys WHERE user_id = ? AND key = ?",
                (user_id, idempotency_key),
            )

        cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_pin(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=400, detail="Incorrect PIN")

        cursor.execute(
            "SELECT balance_kobo FROM accounts WHERE user_id = ?",
            (user_id,),
        )
        account = cursor.fetchone()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        if account["balance_kobo"] < req.amount_kobo:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        reference = f"MON-{req.category[:2].upper()}-{int(datetime.utcnow().timestamp() * 1000)}"

        # --- Demo mode: keep the existing local simulation ---
        if monnify.DEMO_MODE:
            cursor.execute(
                "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
                (req.amount_kobo, user_id),
            )
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'debit', ?, ?, ?, 'completed', ?)""",
                (user_id, reference, req.amount_kobo, req.counterparty_name, req.category, datetime.utcnow().isoformat()),
            )
            cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
            new_balance = cursor.fetchone()["balance_kobo"]
            response = {
                "message": "Transfer successful",
                "status": "completed",
                "reference": reference,
                "new_balance_kobo": new_balance,
                "new_balance_display": f"\u20a6{new_balance / 100:,.2f}",
            }
            cursor.execute(
                "INSERT INTO idempotency_keys (user_id, key, response_json, created_at) VALUES (?, ?, ?, ?)",
                (user_id, idempotency_key, json.dumps(response), datetime.utcnow().isoformat()),
            )
            conn.commit()
            return response

        # --- Live mode: real Monnify transfer ---
        destination_name = req.counterparty_name
        if req.account_number and req.bank_code:
            destination_name = _resolve_destination_name(cursor, req, user_id)

        result = monnify.transfer(
            amount_kobo=req.amount_kobo,
            account_number=req.account_number,
            bank_code=req.bank_code,
            reference=reference,
            account_name=destination_name,
            narration=f"Zuri {req.category} to {destination_name}",
        )

        if result.get("status") == "PENDING_AUTHORIZATION":
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'debit', ?, ?, ?, 'pending', ?)""",
                (user_id, reference, req.amount_kobo, destination_name, req.category, datetime.utcnow().isoformat()),
            )
            conn.commit()
            return {
                "message": "Transfer requires OTP authorization",
                "status": "pending_authorization",
                "reference": reference,
                "amount_kobo": req.amount_kobo,
            }

        if result.get("status") in ("SUCCESS", "COMPLETED"):
            cursor.execute(
                "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
                (req.amount_kobo, user_id),
            )
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'debit', ?, ?, ?, 'completed', ?)""",
                (user_id, reference, req.amount_kobo, destination_name, req.category, datetime.utcnow().isoformat()),
            )
            cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
            new_balance = cursor.fetchone()["balance_kobo"]
            response = {
                "message": "Transfer successful",
                "status": "completed",
                "reference": reference,
                "new_balance_kobo": new_balance,
                "new_balance_display": f"\u20a6{new_balance / 100:,.2f}",
            }
            cursor.execute(
                "INSERT INTO idempotency_keys (user_id, key, response_json, created_at) VALUES (?, ?, ?, ?)",
                (user_id, idempotency_key, json.dumps(response), datetime.utcnow().isoformat()),
            )
            conn.commit()
            return response

        raise HTTPException(status_code=502, detail=f"Transfer failed: {result.get('status', 'unknown')}")
    finally:
        conn.close()


@router.post("/transfer/authorize")
def authorize_transfer(req: TransferAuthorizeRequest, user_id: int = Depends(get_current_user)):
    """Authorize a transfer awaiting OTP (MFA). Submits the OTP sent to the Monnify email."""
    conn = get_db()
    try:
        result = monnify.authorize_transfer(req.reference, req.otp)

        if result.get("status") in ("SUCCESS", "COMPLETED"):
            cursor = conn.cursor()
            cursor.execute(
                "SELECT amount_kobo FROM transactions WHERE user_id = ? AND monnify_ref = ? AND status = 'pending'",
                (user_id, req.reference),
            )
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    "UPDATE transactions SET status = 'completed' WHERE user_id = ? AND monnify_ref = ?",
                    (user_id, req.reference),
                )
                cursor.execute(
                    "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
                    (row["amount_kobo"], user_id),
                )
            cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
            new_balance = cursor.fetchone()["balance_kobo"]
            conn.commit()
            return {
                "message": "Transfer authorized and completed",
                "status": "completed",
                "reference": req.reference,
                "new_balance_kobo": new_balance,
                "new_balance_display": f"\u20a6{new_balance / 100:,.2f}",
            }

        return {
            "message": "Transfer authorization submitted",
            "status": result.get("status", "pending"),
            "reference": req.reference,
        }
    finally:
        conn.close()
