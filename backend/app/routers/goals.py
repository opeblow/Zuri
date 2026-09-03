from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timedelta

from ..database import get_db
from ..schemas import GoalCreate, GoalUpdate, GoalDepositRequest, GoalMandateCreateRequest, GoalAutoSaveRequest, GoalResponse
from .auth import get_current_user
from ..services import monnify

router = APIRouter(prefix="/api", tags=["goals"])


def format_naira(kobo: int) -> str:
    return f"₦{kobo / 100:,.2f}"


@router.get("/goals")
def get_goals(user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()

    goals = []
    for row in rows:
        goal = dict(row)
        goal["progress_pct"] = round((goal["current_amount_kobo"] / goal["target_amount_kobo"]) * 100, 1) if goal["target_amount_kobo"] > 0 else 0
        goal["current_display"] = format_naira(goal["current_amount_kobo"])
        goal["target_display"] = format_naira(goal["target_amount_kobo"])
        goals.append(goal)

    return {"goals": goals}


@router.post("/actions/goal")
def create_goal(req: GoalCreate, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO goals (user_id, name, target_amount_kobo, target_date, recurring_amount_kobo, status)
           VALUES (?, ?, ?, ?, ?, 'active')""",
        (user_id, req.name, req.target_amount_kobo, req.target_date, req.recurring_amount_kobo),
    )
    goal_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"message": f"Goal '{req.name}' created", "goal_id": goal_id}


@router.patch("/actions/goals/{goal_id}")
def update_goal(goal_id: int, req: GoalUpdate, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")

    updates = []
    values = []
    for field, value in req.model_dump(exclude_unset=True).items():
        updates.append(f"{field} = ?")
        values.append(value)

    if updates:
        values.append(goal_id)
        cursor.execute(f"UPDATE goals SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()

    conn.close()
    return {"message": "Goal updated"}


@router.post("/actions/goals/{goal_id}/deposit")
def deposit_goal(goal_id: int, req: GoalDepositRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    goal = cursor.fetchone()
    if not goal:
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")

    cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
    account = cursor.fetchone()
    if account["balance_kobo"] < req.amount_kobo:
        conn.close()
        raise HTTPException(status_code=400, detail="Insufficient balance")

    cursor.execute("UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?", (req.amount_kobo, user_id))
    cursor.execute("UPDATE goals SET current_amount_kobo = current_amount_kobo + ? WHERE id = ?", (req.amount_kobo, goal_id))

    cursor.execute(
        """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
           VALUES (?, ?, 'debit', ?, ?, 'savings', 'completed', ?)""",
        (user_id, f"MON-GOAL-{goal_id}-{int(datetime.utcnow().timestamp())}", req.amount_kobo, f"Goal: {goal['name']}", datetime.utcnow().isoformat()),
    )

    new_balance = account["balance_kobo"] - req.amount_kobo
    conn.commit()
    conn.close()

    return {
        "message": f"Deposited {format_naira(req.amount_kobo)} to {goal['name']}",
        "new_balance_kobo": new_balance,
        "new_balance_display": format_naira(new_balance),
    }


@router.post("/actions/goals/{goal_id}/mandate")
def create_goal_mandate(goal_id: int, req: GoalMandateCreateRequest, user_id: int = Depends(get_current_user)):
    """Set up a Monnify direct-debit mandate so a goal auto-saves from a bank account."""
    conn = get_db()
    try:
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
        goal = cursor.fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")

        cursor.execute(
            "SELECT full_name, email, phone FROM users WHERE id = ?",
            (user_id,),
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        recurring = req.recurring_amount_kobo or goal["recurring_amount_kobo"] or 0

        # --- Demo mode: store a local mandate reference, no Monnify call ---
        if monnify.DEMO_MODE:
            ref = f"MD-{goal_id}-{int(datetime.utcnow().timestamp())}"
            cursor.execute(
                "UPDATE goals SET monnify_mandate_ref = ? WHERE id = ?",
                (ref, goal_id),
            )
            conn.commit()
            return {
                "mandate_code": None,
                "mandate_status": "ACTIVE",
                "message": "Auto-save mandate enabled (demo)",
            }

        mandate_reference = f"ZUR-GOAL-{goal_id}-{int(datetime.utcnow().timestamp() * 1000)}"
        start = datetime.utcnow()
        end = start + timedelta(days=365)

        result = monnify.create_mandate(
            mandate_reference=mandate_reference,
            customer_name=user["full_name"],
            customer_email=user["email"],
            customer_phone=user["phone"],
            customer_address=req.address,
            customer_account_number=req.account_number,
            customer_bank_code=req.bank_code,
            mandate_description=f"Auto-save for goal: {goal['name']}",
            mandate_start_date=start.strftime("%Y-%m-%dT%H:%M:%S"),
            mandate_end_date=end.strftime("%Y-%m-%dT%H:%M:%S"),
        )

        cursor.execute(
            "UPDATE goals SET monnify_mandate_ref = ? WHERE id = ?",
            (result.get("mandate_code"), goal_id),
        )
        conn.commit()
        return result
    finally:
        conn.close()


@router.post("/actions/goals/{goal_id}/auto-save")
def auto_save_goal(goal_id: int, req: GoalAutoSaveRequest, user_id: int = Depends(get_current_user)):
    """Trigger a recurring auto-save: debit the goal's mandate and credit the goal (Moment 1)."""
    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
        goal = cursor.fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")

        cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        mandate_code = goal["monnify_mandate_ref"]

        # --- Demo mode: local credit simulation ---
        if monnify.DEMO_MODE or not mandate_code:
            if not monnify.DEMO_MODE and not mandate_code:
                raise HTTPException(status_code=400, detail="No mandate set up for this goal")
            cursor.execute(
                "UPDATE goals SET current_amount_kobo = current_amount_kobo + ? WHERE id = ?",
                (req.amount_kobo, goal_id),
            )
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'credit', ?, ?, 'savings', 'completed', ?)""",
                (user_id, f"MON-AS-{goal_id}-{int(datetime.utcnow().timestamp() * 1000)}", req.amount_kobo, f"Auto-save: {goal['name']}", datetime.utcnow().isoformat()),
            )
            cursor.execute("SELECT current_amount_kobo FROM goals WHERE id = ?", (goal_id,))
            new_goal = cursor.fetchone()["current_amount_kobo"]
            conn.commit()
            return {
                "message": f"Auto-saved {format_naira(req.amount_kobo)} to {goal['name']}",
                "status": "completed",
                "current_amount_kobo": new_goal,
                "current_display": format_naira(new_goal),
            }

        payment_reference = f"ZUR-AS-{goal_id}-{int(datetime.utcnow().timestamp() * 1000)}"
        result = monnify.debit_mandate(
            mandate_code=mandate_code,
            payment_reference=payment_reference,
            debit_amount_kobo=req.amount_kobo,
            narration=f"Auto-save for {goal['name']}",
            customer_email=user["email"],
        )

        cursor.execute(
            "UPDATE goals SET current_amount_kobo = current_amount_kobo + ? WHERE id = ?",
            (req.amount_kobo, goal_id),
        )
        cursor.execute(
            """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
               VALUES (?, ?, 'credit', ?, ?, 'savings', 'completed', ?)""",
            (user_id, payment_reference, req.amount_kobo, f"Auto-save: {goal['name']}", datetime.utcnow().isoformat()),
        )
        cursor.execute("SELECT current_amount_kobo FROM goals WHERE id = ?", (goal_id,))
        new_goal = cursor.fetchone()["current_amount_kobo"]
        conn.commit()
        return {
            "message": result.get("message") or "Auto-save debit submitted",
            "status": result.get("transaction_status", "PENDING"),
            "transaction_reference": result.get("transaction_reference"),
            "current_amount_kobo": new_goal,
            "current_display": format_naira(new_goal),
        }
    finally:
        conn.close()


@router.post("/actions/goals/{goal_id}/withdraw")
def withdraw_goal(goal_id: int, req: GoalDepositRequest, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    goal = cursor.fetchone()
    if not goal:
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal["current_amount_kobo"] < req.amount_kobo:
        conn.close()
        raise HTTPException(status_code=400, detail="Insufficient goal balance")

    cursor.execute("UPDATE goals SET current_amount_kobo = current_amount_kobo - ? WHERE id = ?", (req.amount_kobo, goal_id))
    cursor.execute("UPDATE accounts SET balance_kobo = balance_kobo + ? WHERE user_id = ?", (req.amount_kobo, user_id))

    cursor.execute(
        """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
           VALUES (?, ?, 'credit', ?, ?, 'savings', 'completed', ?)""",
        (user_id, f"MON-GWD-{goal_id}-{int(datetime.utcnow().timestamp())}", req.amount_kobo, f"Goal withdrawal: {goal['name']}", datetime.utcnow().isoformat()),
    )

    cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
    account = cursor.fetchone()
    conn.commit()
    conn.close()

    return {
        "message": f"Withdrew {format_naira(req.amount_kobo)} from {goal['name']}",
        "new_balance_kobo": account["balance_kobo"],
        "new_balance_display": format_naira(account["balance_kobo"]),
    }


@router.delete("/actions/goals/{goal_id}")
def delete_goal(goal_id: int, user_id: int = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Goal not found")

    cursor.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    conn.commit()
    conn.close()

    return {"message": "Goal deleted"}
