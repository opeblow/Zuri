import json
from fastapi import APIRouter, HTTPException, Depends, Query, Header
from typing import Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..schemas import TransactionResponse, TransactionUpdate, TransferRequest
from .auth import get_current_user
from ..services.auth_service import verify_pin

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
            "UPDATE accounts SET balance_kobo = balance_kobo - ? "
            "WHERE user_id = ? AND balance_kobo >= ?",
            (req.amount_kobo, user_id, req.amount_kobo),
        )
        if cursor.rowcount != 1:
            cursor.execute("SELECT 1 FROM accounts WHERE user_id = ?", (user_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Account not found")
            raise HTTPException(status_code=400, detail="Insufficient balance")

        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        account = cursor.fetchone()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

        monnify_ref = f"MON-{req.category[:2].upper()}-{int(datetime.utcnow().timestamp())}"
        cursor.execute(
            """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
               VALUES (?, ?, 'debit', ?, ?, ?, 'completed', ?)""",
            (user_id, monnify_ref, req.amount_kobo, req.counterparty_name, req.category, datetime.utcnow().isoformat()),
        )

        if req.account_number and req.bank_code:
            cursor.execute(
                "SELECT id FROM beneficiaries WHERE user_id = ? AND account_number = ? AND bank_code = ?",
                (user_id, req.account_number, req.bank_code),
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    "UPDATE beneficiaries SET send_count = send_count + 1 WHERE id = ?",
                    (existing["id"],),
                )
            else:
                cursor.execute(
                    "INSERT INTO beneficiaries (user_id, full_name, account_number, bank_code) VALUES (?, ?, ?, ?)",
                    (user_id, req.counterparty_name, req.account_number, req.bank_code),
                )

        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        new_balance = cursor.fetchone()["balance_kobo"]

        response = {
            "message": "Transfer successful",
            "new_balance_kobo": new_balance,
            "new_balance_display": f"\u20a6{new_balance / 100:,.2f}",
        }
        cursor.execute(
            "INSERT INTO idempotency_keys (user_id, key, response_json, created_at) VALUES (?, ?, ?, ?)",
            (user_id, idempotency_key, json.dumps(response), datetime.utcnow().isoformat()),
        )
        conn.commit()
        return response
    finally:
        conn.close()
