from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

from ..database import get_db
from ..schemas import TransferRequest
from .auth import get_current_user
from ..services import monnify
from ..services.auth_service import verify_pin

router = APIRouter(prefix="/api/actions", tags=["actions"])


def _naira(kobo: int) -> str:
    return f"₦{(kobo or 0) / 100:,.2f}"


@router.post("/transfer")
def transfer(req: TransferRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user or not verify_pin(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=401, detail="Invalid PIN")

        cursor.execute(
            "SELECT * FROM beneficiaries WHERE id = ? AND user_id = ?",
            (req.beneficiary_id, user_id),
        )
        beneficiary = cursor.fetchone()
        if not beneficiary:
            raise HTTPException(status_code=404, detail="Beneficiary not found")

        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        account = cursor.fetchone()
        if not account or account["balance_kobo"] < req.amount_kobo:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        reference = f"XFER-{user_id}-{int(datetime.utcnow().timestamp() * 1000)}"

        try:
            result = monnify.transfer(
                amount_kobo=req.amount_kobo,
                account_number=beneficiary["account_number"],
                bank_code=beneficiary["bank_code"],
                reference=reference,
                narration=req.narration or f"Zuri transfer to {beneficiary['full_name']}",
                account_name=beneficiary["full_name"],
            )
        except monnify.MonnifyError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        cursor.execute(
            "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
            (req.amount_kobo, user_id),
        )
        cursor.execute(
            """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
               VALUES (?, ?, 'debit', ?, ?, 'transfers', ?, ?)""",
            (
                user_id,
                result["reference"],
                req.amount_kobo,
                beneficiary["full_name"],
                "completed" if result["status"] in ("SUCCESS", "COMPLETED") else "pending",
                datetime.utcnow().isoformat(),
            ),
        )
        cursor.execute(
            "UPDATE beneficiaries SET send_count = send_count + 1 WHERE id = ?",
            (beneficiary["id"],),
        )
        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        new_balance = cursor.fetchone()["balance_kobo"]
        conn.commit()

        return {
            "reference": result["reference"],
            "status": result["status"],
            "new_balance_kobo": new_balance,
            "new_balance_display": _naira(new_balance),
        }
    finally:
        conn.close()
