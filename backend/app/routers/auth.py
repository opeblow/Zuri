import os
from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from jose import JWTError

from ..database import get_db
from ..schemas import SignupRequest, LoginRequest, VerifyPinRequest, TokenResponse
from ..services.auth_service import hash_pin, verify_pin, create_access_token, decode_token, decode_token_unverified
from ..services import monnify

router = APIRouter(prefix="/api/auth", tags=["auth"])

DEV_MODE = os.getenv("NODE_ENV", "development") != "production"


def get_current_user(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    token = authorization.replace("Bearer ", "")
    try:
        return decode_token(token)
    except JWTError:
        if DEV_MODE:
            return decode_token_unverified(token)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/signup", response_model=TokenResponse)
def signup(req: SignupRequest):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE phone = ?", (req.phone,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Phone number already registered")

    pin_hashed = hash_pin(req.pin)
    password_hashed = hash_pin(req.password)
    cursor.execute(
        "INSERT INTO users (phone, email, full_name, pin_hash, password_hash, language_pref) VALUES (?, ?, ?, ?, ?, ?)",
        (req.phone, req.email, req.full_name, pin_hashed, password_hashed, req.language_pref),
    )
    user_id = cursor.lastrowid

    cursor.execute(
        "INSERT INTO accounts (user_id, balance_kobo) VALUES (?, 0)",
        (user_id,),
    )

    # Provision a real Monnify reserved account so the user has somewhere to
    # actually fund. Degrades silently in demo mode (no Monnify credentials)
    # or if Monnify is unreachable — the onboarding wizard's starting balance
    # still lets the app work without it.
    if not monnify.DEMO_MODE:
        try:
            account_reference = f"ZURI-{user_id}-{req.phone}"
            reserved = monnify.create_reserved_account(
                account_reference=account_reference,
                account_name=req.full_name,
                email=req.email,
            )
            cursor.execute(
                "UPDATE accounts SET monnify_reserved_account = ?, monnify_account_ref = ?, bank_name = ? WHERE user_id = ?",
                (reserved["account_number"], reserved["account_reference"], reserved["bank_name"], user_id),
            )
        except Exception:
            pass

    conn.commit()
    conn.close()

    token = create_access_token(user_id)
    return TokenResponse(access_token=token, user_id=user_id)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, pin_hash FROM users WHERE phone = ?", (req.phone,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid phone or PIN")

    if not verify_pin(req.pin, row["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid phone or PIN")

    token = create_access_token(row["id"])
    return TokenResponse(access_token=token, user_id=row["id"])


@router.post("/verify-pin")
def verify_user_pin(req: VerifyPinRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    valid = verify_pin(req.pin, row["pin_hash"])
    return {"valid": valid}
