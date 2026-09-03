import os
import json
import urllib.request
import urllib.error
from fastapi import APIRouter, HTTPException, Depends

from ..database import get_db
from ..schemas import BeneficiaryCreate, BankResolveRequest, BankResolveResponse
from .auth import get_current_user
from ..services import monnify
from ..banks import get_all_banks

router = APIRouter(prefix="/api/beneficiaries", tags=["beneficiaries"])

PAYSTACK_SECRET_KEY = os.environ.get("PAYSTACK_SECRET_KEY", "")


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


def _bank_name_for(bank_code: str) -> str:
    for b in get_all_banks():
        if b["code"] == bank_code:
            return b["name"]
    return "Unknown Bank"


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
    return {"banks": get_all_banks()}


@router.post("/resolve", response_model=BankResolveResponse)
def resolve_account(req: BankResolveRequest):
    # 1) Live Monnify Name Inquiry (the hackathon payment rail)
    if not monnify.DEMO_MODE:
        try:
            verified = monnify.verify_account(req.account_number, req.bank_code)
            return BankResolveResponse(
                account_number=req.account_number,
                account_name=verified["account_name"],
                bank_name=_bank_name_for(req.bank_code),
            )
        except Exception:
            pass  # fall through to Paystack / dev fallback

    # 2) Try live Paystack resolution
    live_name = _resolve_via_paystack(req.account_number, req.bank_code)
    if live_name:
        return BankResolveResponse(
            account_number=req.account_number,
            account_name=live_name,
            bank_name=_bank_name_for(req.bank_code),
        )

    # 3) Dev fallback — never break local development
    return BankResolveResponse(
        account_number=req.account_number,
        account_name=f"Account Holder {req.account_number[-4:]}",
        bank_name=_bank_name_for(req.bank_code),
    )
