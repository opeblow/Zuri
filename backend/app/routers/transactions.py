from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional

from ..database import get_db
from ..schemas import TransactionUpdate, LogTransactionRequest
from .auth import get_current_user
from ..services.ledger_service import log_entry

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


@router.post("/log")
def log_transaction(req: LogTransactionRequest, user_id: int = Depends(get_current_user)):
    """Manual quick-log fallback for the Home screen — the same ledger write the
    AI's log_transaction tool performs, just triggered by a form instead of a
    conversation."""
    result = log_entry(user_id, req.direction, req.amount_kobo, req.category, req.note)
    return {"message": "Logged", **result}
