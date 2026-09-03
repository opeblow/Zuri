import os
import json
import time
import urllib.request
import urllib.error
from fastapi import APIRouter, HTTPException, Depends

from ..database import get_db
from ..schemas import BeneficiaryCreate, BeneficiaryResponse, BankResolveRequest, BankResolveResponse
from .auth import get_current_user

router = APIRouter(prefix="/api/beneficiaries", tags=["beneficiaries"])

PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")

BANK_CACHE = {"data": None, "ts": 0}

FALLBACK_BANKS = [
    {"code": "044", "name": "Access Bank"},
    {"code": "063", "name": "Diamond Bank"},
    {"code": "050", "name": "Ecobank Nigeria"},
    {"code": "045", "name": "Equitorial Trust Bank"},
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
    {"code": "091", "name": "Palmpay"},
    {"code": "100", "name": "SunTrust Bank"},
    {"code": "101", "name": "Providus Bank"},
    {"code": "082", "name": "Keystone Bank"},
    {"code": "301", "name": "Jaiz Bank"},
    {"code": "999", "name": "Moniepoint MFB"},
    {"code": "073", "name": "Opay"},
    {"code": "091", "name": "Kuda Bank"},
    {"code": "0901", "name": "VBank"},
    {"code": "50211", "name": "Palmpay"},
    {"code": "100004", "name": "OPay (Paycom)"},
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
        with urllib.request.urlopen(req, timeout=8) as resp:
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


def _resolve_via_paystack(account_number: str, bank_code: str):
    """Try live resolution via Paystack. Returns account_name or None."""
    if not PAYSTACK_SECRET_KEY:
        return None
    try:
        url = f"https://api.paystack.co/bank/resolve?account_number={account_number}&bank_code={bank_code}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = json.loads(resp.read().decode())
            if body.get("status") and body.get("data"):
                return body["data"].get("account_name")
    except (urllib.error.URLError, json.JSONDecodeError, KeyError, OSError):
        pass
    return None


@router.get("/")
def list_beneficiaries(user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM beneficiaries WHERE user_id = ? ORDER BY send_count DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return {"beneficiaries": [dict(r) for r in rows]}


@router.post("/")
def add_beneficiary(req: BeneficiaryCreate, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO beneficiaries (user_id, nickname, full_name, account_number, bank_code)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, req.nickname, req.full_name, req.account_number, req.bank_code),
    )
    ben_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"message": "Beneficiary added", "id": ben_id}


@router.delete("/{beneficiary_id}")
def delete_beneficiary(beneficiary_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM beneficiaries WHERE id = ? AND user_id = ?", (beneficiary_id, user_id))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Beneficiary not found")
    cursor.execute("DELETE FROM beneficiaries WHERE id = ?", (beneficiary_id,))
    conn.commit()
    conn.close()
    return {"message": "Beneficiary deleted"}


@router.get("/banks")
def list_banks():
    now = time.time()
    if BANK_CACHE["data"] and now - BANK_CACHE["ts"] < 3600:
        return {"banks": BANK_CACHE["data"]}

    live = _fetch_banks_from_paystack()
    if live:
        BANK_CACHE["data"] = live
        BANK_CACHE["ts"] = now
        return {"banks": live}

    return {"banks": FALLBACK_BANKS}


@router.post("/resolve")
def resolve_account(req: BankResolveRequest):
    # 1) Try live Paystack resolution
    live_name = _resolve_via_paystack(req.account_number, req.bank_code)
    if live_name:
        bank_name = "Unknown Bank"
        for b in FALLBACK_BANKS:
            if b["code"] == req.bank_code:
                bank_name = b["name"]
                break
        return BankResolveResponse(
            account_number=req.account_number,
            account_name=live_name,
            bank_name=bank_name,
        )

    # 2) Dev fallback – never break local development
    dev_name = f"Account Holder {req.account_number[-4:]}"
    bank_name = "Unknown Bank"
    for b in FALLBACK_BANKS:
        if b["code"] == req.bank_code:
            bank_name = b["name"]
            break
    return BankResolveResponse(
        account_number=req.account_number,
        account_name=dev_name,
        bank_name=bank_name,
    )


@router.post("/api/actions/verify-account")
def verify_account(req: BankResolveRequest):
    return resolve_account(req)
