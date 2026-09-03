import asyncio
import json
import os
import urllib.request
import urllib.error
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime
from jose import JWTError

from ..database import get_db
from ..schemas import AccountResponse
from .auth import get_current_user
from ..services.auth_service import decode_token
from ..banks import get_all_banks
router = APIRouter(prefix="/api", tags=["account"])

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")


def format_naira(kobo: int) -> str:
    naira = kobo / 100
    return f"â‚¦{naira:,.2f}"


@router.get("/account", response_model=AccountResponse)
def get_account(user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT full_name FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    cursor.execute("SELECT * FROM accounts WHERE user_id = ?", (user_id,))
    account = cursor.fetchone()
    conn.close()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    return AccountResponse(
        user_id=user_id,
        full_name=user["full_name"],
        balance_kobo=account["balance_kobo"],
        balance_display=format_naira(account["balance_kobo"]),
        account_number=account["monnify_reserved_account"],
        bank_name=account["bank_name"],
    )


@router.post("/demo/salary-landed")
def salary_landed(user_id: int = Depends(get_current_user)):
    salary_kobo = 35000000

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("UPDATE accounts SET balance_kobo = balance_kobo + ? WHERE user_id = ?", (salary_kobo, user_id))

    cursor.execute(
        """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, f"MON-SAL-{int(datetime.utcnow().timestamp())}", "credit", salary_kobo, "TechCorp Ltd", "income", "completed", datetime.utcnow().isoformat()),
    )

    cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
    account = cursor.fetchone()
    conn.commit()
    conn.close()

    return {
        "message": "Salary credited successfully",
        "amount_kobo": salary_kobo,
        "new_balance_kobo": account["balance_kobo"],
        "new_balance_display": format_naira(account["balance_kobo"]),
    }


@router.post("/demo/reset")
def reset_demo(user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM conversations WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM automations WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM transactions WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM goals WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM beneficiaries WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM accounts WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))

    conn.commit()
    conn.close()

    return {"message": "Demo data reset successfully"}


@router.get("/banks")
def list_all_banks():
    return {"banks": get_all_banks()}


@router.get("/events/stream")
async def events_stream(token: Optional[str] = Query(None)):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    async def event_generator():
        yield f"event: connected\ndata: {datetime.utcnow().isoformat()}\n\n"
        while True:
            await asyncio.sleep(15)
            yield ": heartbeat\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
