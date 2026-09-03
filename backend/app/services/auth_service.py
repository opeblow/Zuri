import os
import hashlib
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

JWT_SECRET = os.getenv("JWT_SECRET", "zuri_secret_key_hackathon_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 72

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_pin(pin: str) -> str:
    return pwd_context.hash(pin)


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    if hashed_pin.startswith("$2"):
        return pwd_context.verify(plain_pin, hashed_pin)
    # Accept hashes created by older demo databases during migration.
    return hashlib.sha256(plain_pin.encode()).hexdigest() == hashed_pin


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> int:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    return int(payload["sub"])


def decode_token_unverified(token: str) -> int:
    """Decode an expired JWT without verification to extract user_id (dev only)."""
    try:
        payload = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
        return int(payload["sub"])
    except Exception:
        return 1
