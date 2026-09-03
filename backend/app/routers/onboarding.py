from datetime import datetime, timedelta
from fastapi import APIRouter, Depends

from ..database import get_db
from ..schemas import OnboardingSetupRequest
from .auth import get_current_user

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


@router.post("/setup")
def setup(req: OnboardingSetupRequest, user_id: int = Depends(get_current_user)):
    """Seed backdated history for insights to reason about, then set the balance to
    exactly what the user says it is right now. The backdated rows are historical
    record only — they never touch the balance; the final UPDATE is the single
    source of truth for the starting balance."""
    conn = get_db()
    cursor = conn.cursor()

    def insert(direction, amount_kobo, category, note, days_ago):
        ts = (datetime.utcnow() - timedelta(days=days_ago)).isoformat()
        ref = f"SEED-{direction[:2].upper()}-{days_ago}-{category}"
        cursor.execute(
            """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)""",
            (user_id, ref, direction, amount_kobo, note, category, ts),
        )

    if req.monthly_income_kobo > 0:
        insert("credit", req.monthly_income_kobo, "income", "Income", days_ago=30)

    for expense in req.recurring_expenses:
        insert("debit", expense.amount_kobo, expense.category, expense.name, days_ago=60)
        varied = max(1, int(expense.amount_kobo * 1.03))
        insert("debit", varied, expense.category, expense.name, days_ago=30)

    cursor.execute(
        "UPDATE accounts SET balance_kobo = ? WHERE user_id = ?",
        (req.starting_balance_kobo, user_id),
    )
    conn.commit()
    conn.close()

    return {"message": "Onboarding setup complete"}
