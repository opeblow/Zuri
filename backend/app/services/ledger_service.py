"""Single source of truth for turning a self-reported entry into a balance change.

Zuri never touches a real bank account — every credit/debit here is something the
user told Zuri about, via the manual log endpoint or the AI's log_transaction tool.
Both call this so there is exactly one place the balance math happens.
"""

from datetime import datetime

from ..database import get_db


def _naira(kobo: int) -> str:
    return f"₦{(kobo or 0) / 100:,.2f}"


def log_entry(user_id: int, direction: str, amount_kobo: int, category: str, note: str = None) -> dict:
    if direction not in ("credit", "debit"):
        raise ValueError("direction must be 'credit' or 'debit'")
    if amount_kobo <= 0:
        raise ValueError("amount_kobo must be positive")

    conn = get_db()
    try:
        cursor = conn.cursor()
        delta = amount_kobo if direction == "credit" else -amount_kobo
        cursor.execute(
            "UPDATE accounts SET balance_kobo = balance_kobo + ? WHERE user_id = ?",
            (delta, user_id),
        )
        reference = f"LOG-{direction[:2].upper()}-{int(datetime.utcnow().timestamp() * 1000)}"
        cursor.execute(
            """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)""",
            (user_id, reference, direction, amount_kobo, note or category.title(), category, datetime.utcnow().isoformat()),
        )
        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        new_balance = row["balance_kobo"] if row else 0
        conn.commit()
        return {
            "reference": reference,
            "new_balance_kobo": new_balance,
            "new_balance_display": _naira(new_balance),
        }
    finally:
        conn.close()
