"""User settings — profile, PIN change, language preference."""

from fastapi import APIRouter, HTTPException, Depends

from ..database import get_db
from ..schemas import ProfileUpdate, ChangePinRequest
from ..services.auth_service import hash_pin, verify_pin
from .auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.patch("/profile")
def update_profile(req: ProfileUpdate, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    updates = []
    values = []
    for field, value in req.model_dump(exclude_unset=True).items():
        updates.append(f"{field} = ?")
        values.append(value)

    if updates:
        values.append(user_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return {"message": "Profile updated"}


@router.patch("/change-pin")
def change_pin(req: ChangePinRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT pin_hash FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_pin(req.old_pin, row["pin_hash"]):
        conn.close()
        raise HTTPException(status_code=400, detail="Current PIN is incorrect")

    new_hash = hash_pin(req.new_pin)
    cursor.execute("UPDATE users SET pin_hash = ? WHERE id = ?", (new_hash, user_id))
    conn.commit()
    conn.close()

    return {"message": "PIN changed successfully"}


@router.delete("/account")
def delete_account(user_id: int = Depends(get_current_user)):
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

    return {"message": "Account deleted successfully"}
