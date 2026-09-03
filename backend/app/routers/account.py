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
from ..database import seed_demo_data

router = APIRouter(prefix="/api", tags=["account"])

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")

BANK_CACHE = {"data": None, "ts": 0}

FALLBACK_BANKS = [
    {"code": "044", "name": "Access Bank"},
    {"code": "063", "name": "Diamond Bank"},
    {"code": "050", "name": "Ecobank Nigeria"},
    {"code": "011", "name": "First Bank of Nigeria"},
    {"code": "214", "name": "First City Monument Bank"},
    {"code": "070", "name": "Fidelity Bank"},
    {"code": "058", "name": "Guaranty Trust Bank"},
    {"code": "030", "name": "Heritage Bank"},
    {"code": "016", "name": "Standard Chartered Bank"},
    {"code": "032", "name": "Sterling Bank"},
    {"code": "033", "name": "United Bank for Africa"},
    {"code": "035", "name": "Union Bank of Nigeria"},
    {"code": "076", "name": "Polaris Bank"},
    {"code": "057", "name": "Wema Bank"},
    {"code": "054", "name": "Zenith Bank"},
    {"code": "090", "name": "Globus Bank"},
    {"code": "100", "name": "SunTrust Bank"},
    {"code": "091", "name": "Payment Protection"},
    {"code": "101", "name": "Providus Bank"},
    {"code": "070", "name": "Fidelity Bank"},
    {"code": "232", "name": "Sterling Bank"},
    {"code": "039", "name": "Platinum Habib Bank"},
    {"code": "082", "name": "Keystone Bank"},
    {"code": "035", "name": "Wema Bank"},
    {"code": "068", "name": "Standard Chartered Bank"},
    {"code": "301", "name": "Jaiz Bank"},
    {"code": "089", "name": "TrustBank"},
    {"code": "999", "name": "Moniepoint MFB"},
    {"code": "100", "name": "GlobePay"},
    {"code": "073", "name": "Orgaan Grown MFB"},
]


def _fetch_banks_from_paystack():
    try:
        headers = {"Accept": "application/json"}
        if PAYSTACK_SECRET_KEY:
            headers["Authorization"] = f"Bearer {PAYSTACK_SECRET_KEY}"
        req = urllib.request.Request(
            "https://api.paystack.co/bank?country=nigeria&per_page=200",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode())
            if body.get("status") and body.get("data"):
                return [
                    {"code": b.get("code", ""), "name": b.get("name", "")}
                    for b in body["data"]
                    if b.get("active")
                ]
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, OSError):
        pass
    return None


def format_naira(kobo: int) -> str:
    naira = kobo / 100
    return f"₦{naira:,.2f}"


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

    seed_demo_data()

    return {"message": "Demo data reset successfully"}


@router.get("/banks")
def list_all_banks():
    import time
    now = time.time()
    if BANK_CACHE["data"] and now - BANK_CACHE["ts"] < 3600:
        return {"banks": BANK_CACHE["data"]}

    live = _fetch_banks_from_paystack()
    if live:
        BANK_CACHE["data"] = live
        BANK_CACHE["ts"] = now
        return {"banks": live}

    return {"banks": FALLBACK_BANKS}


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
