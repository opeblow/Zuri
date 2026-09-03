"""Deterministic spend-intelligence engine.

Computes runway, category breakdown, recurring-charge and anomaly detection,
and goal-vs-reality checks directly from the transactions/accounts/goals
tables. No LLM involved here — this is the ground truth the AI agent quotes
from, so the numbers Zuri says out loud are always real.
"""

from datetime import datetime, timedelta
from collections import defaultdict

from ..database import get_db


def _naira(kobo: int) -> str:
    return f"₦{(kobo or 0) / 100:,.2f}"


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts)


def _pct_change(this: int, last: int) -> float:
    if last > 0:
        return round(((this - last) / last) * 100, 1)
    return 100.0 if this > 0 else 0.0


def _period_bounds(now: datetime):
    start_of_week = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    prev_week_start = start_of_week - timedelta(days=7)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = start_of_month - timedelta(seconds=1)
    prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return start_of_week, prev_week_start, start_of_month, prev_month_start, prev_month_end


def _sum_amount(txs, direction=None):
    return sum(t["amount_kobo"] for t in txs if direction is None or t["direction"] == direction)


def compute_insights(user_id: int) -> dict:
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
    account = cursor.fetchone()
    balance_kobo = account["balance_kobo"] if account else 0

    cursor.execute(
        "SELECT id, direction, amount_kobo, counterparty_name, category, timestamp "
        "FROM transactions WHERE user_id = ? AND status != 'pending' ORDER BY timestamp ASC",
        (user_id,),
    )
    rows = [dict(r) for r in cursor.fetchall()]

    cursor.execute(
        "SELECT id, name, current_amount_kobo, target_amount_kobo, recurring_amount_kobo, status "
        "FROM goals WHERE user_id = ? AND status = 'active'",
        (user_id,),
    )
    goals = [dict(r) for r in cursor.fetchall()]
    conn.close()

    for t in rows:
        t["_dt"] = _parse_ts(t["timestamp"])

    now = datetime.utcnow()
    start_of_week, prev_week_start, start_of_month, prev_month_start, prev_month_end = _period_bounds(now)

    this_week = [t for t in rows if t["_dt"] >= start_of_week]
    last_week = [t for t in rows if prev_week_start <= t["_dt"] < start_of_week]
    this_month = [t for t in rows if t["_dt"] >= start_of_month]
    last_month = [t for t in rows if prev_month_start <= t["_dt"] <= prev_month_end]

    this_week_spend = _sum_amount(this_week, "debit")
    last_week_spend = _sum_amount(last_week, "debit")
    this_month_spend = _sum_amount(this_month, "debit")
    last_month_spend = _sum_amount(last_month, "debit")
    this_month_income = _sum_amount(this_month, "credit")
    last_month_income = _sum_amount(last_month, "credit")

    # Category breakdown for the current month
    cat_totals = defaultdict(int)
    for t in this_month:
        if t["direction"] == "debit":
            cat_totals[t["category"] or "other"] += t["amount_kobo"]
    total_month_debit = sum(cat_totals.values()) or 1
    category_breakdown = sorted(
        [
            {
                "category": cat,
                "amount_kobo": amt,
                "amount_display": _naira(amt),
                "pct": round(amt / total_month_debit * 100, 1),
            }
            for cat, amt in cat_totals.items()
        ],
        key=lambda c: c["amount_kobo"],
        reverse=True,
    )

    # Burn rate & runway (trailing 30 days)
    window_start = now - timedelta(days=30)
    windowed_debits = [t for t in rows if t["_dt"] >= window_start and t["direction"] == "debit"]
    first_activity = rows[0]["_dt"] if rows else now
    days_active = max(1, min(30, (now - max(window_start, first_activity)).days + 1))
    daily_burn_kobo = _sum_amount(windowed_debits) // days_active
    runway_days = int(balance_kobo // daily_burn_kobo) if daily_burn_kobo > 0 else None

    # Recurring-charge detection: group debits by counterparty
    by_counterparty = defaultdict(list)
    for t in rows:
        if t["direction"] == "debit" and t["counterparty_name"]:
            by_counterparty[t["counterparty_name"].strip().lower()].append(t)

    recurring_charges = []
    for name, txs in by_counterparty.items():
        if len(txs) < 2:
            continue
        amounts = [t["amount_kobo"] for t in txs]
        avg_amount = sum(amounts) / len(amounts)
        if avg_amount <= 0:
            continue
        if any(abs(a - avg_amount) / avg_amount > 0.15 for a in amounts):
            continue
        txs_sorted = sorted(txs, key=lambda t: t["_dt"])
        intervals = [
            (txs_sorted[i]["_dt"] - txs_sorted[i - 1]["_dt"]).days
            for i in range(1, len(txs_sorted))
        ]
        avg_interval = sum(intervals) / len(intervals) if intervals else 30
        last_dt = txs_sorted[-1]["_dt"]
        recurring_charges.append({
            "name": txs_sorted[-1]["counterparty_name"],
            "avg_amount_kobo": int(avg_amount),
            "avg_amount_display": _naira(int(avg_amount)),
            "occurrences": len(txs_sorted),
            "avg_interval_days": round(avg_interval),
            "next_expected_date": (last_dt + timedelta(days=round(avg_interval) or 30)).date().isoformat(),
        })
    recurring_charges.sort(key=lambda r: r["avg_amount_kobo"], reverse=True)

    # Anomaly detection: debit far above its category's own trailing average
    by_category_debits = defaultdict(list)
    for t in rows:
        if t["direction"] == "debit":
            by_category_debits[t["category"] or "other"].append(t)

    anomalies = []
    for cat, txs in by_category_debits.items():
        if len(txs) < 3:
            continue
        for t in txs:
            others = [o["amount_kobo"] for o in txs if o["id"] != t["id"]]
            if not others:
                continue
            avg_others = sum(others) / len(others)
            if avg_others > 0 and t["amount_kobo"] > avg_others * 2:
                anomalies.append({
                    "id": t["id"],
                    "category": cat,
                    "counterparty_name": t["counterparty_name"],
                    "amount_kobo": t["amount_kobo"],
                    "amount_display": _naira(t["amount_kobo"]),
                    "category_avg_kobo": int(avg_others),
                    "timestamp": t["timestamp"],
                })
    anomalies.sort(key=lambda a: a["timestamp"], reverse=True)
    anomalies = anomalies[:5]

    # Goal-vs-reality
    total_committed = sum(g["recurring_amount_kobo"] or 0 for g in goals)
    projected_monthly_spend = daily_burn_kobo * 30
    monthly_income_estimate = this_month_income or last_month_income
    disposable_estimate = monthly_income_estimate - projected_monthly_spend if monthly_income_estimate else None
    goals_at_risk = []
    if disposable_estimate is not None and total_committed > disposable_estimate:
        for g in goals:
            if g["recurring_amount_kobo"]:
                goals_at_risk.append({
                    "goal_id": g["id"],
                    "name": g["name"],
                    "recurring_amount_kobo": g["recurring_amount_kobo"],
                    "recurring_amount_display": _naira(g["recurring_amount_kobo"]),
                    "message": (
                        f"Committed {_naira(total_committed)}/month across goals but only "
                        f"~{_naira(max(disposable_estimate, 0))} looks disposable this month."
                    ),
                })

    return {
        "balance_kobo": balance_kobo,
        "balance_display": _naira(balance_kobo),
        "period": {
            "this_week_spend_kobo": this_week_spend,
            "last_week_spend_kobo": last_week_spend,
            "week_change_pct": _pct_change(this_week_spend, last_week_spend),
            "this_month_spend_kobo": this_month_spend,
            "last_month_spend_kobo": last_month_spend,
            "month_change_pct": _pct_change(this_month_spend, last_month_spend),
            "this_month_income_kobo": this_month_income,
        },
        "category_breakdown": category_breakdown,
        "burn_rate": {
            "daily_avg_kobo": daily_burn_kobo,
            "daily_avg_display": _naira(daily_burn_kobo),
            "runway_days": runway_days,
        },
        "recurring_charges": recurring_charges,
        "anomalies": anomalies,
        "goals_at_risk": goals_at_risk,
    }


def summarize_insights_for_ai(insights: dict) -> str:
    """Compact text block the AI agent can quote from verbatim."""
    lines = ["Spending insights (computed, not estimated):"]
    p = insights["period"]
    lines.append(
        f"- This week's spend: {_naira(p['this_week_spend_kobo'])} "
        f"({p['week_change_pct']:+.1f}% vs last week's {_naira(p['last_week_spend_kobo'])})"
    )
    lines.append(
        f"- This month's spend: {_naira(p['this_month_spend_kobo'])} "
        f"({p['month_change_pct']:+.1f}% vs last month's {_naira(p['last_month_spend_kobo'])})"
    )

    if insights["category_breakdown"]:
        top = insights["category_breakdown"][:3]
        cats = ", ".join(f"{c['category']} {_naira(c['amount_kobo'])} ({c['pct']}%)" for c in top)
        lines.append(f"- Top spend categories this month: {cats}")

    burn = insights["burn_rate"]
    if burn["runway_days"] is not None:
        lines.append(
            f"- Burn rate: {_naira(burn['daily_avg_kobo'])}/day. "
            f"At this pace, current balance covers about {burn['runway_days']} more day(s)."
        )

    if insights["recurring_charges"]:
        rec = insights["recurring_charges"][:3]
        names = ", ".join(f"{r['name']} ({r['avg_amount_display']} every ~{r['avg_interval_days']}d)" for r in rec)
        lines.append(f"- Recurring charges detected: {names}")

    if insights["anomalies"]:
        a = insights["anomalies"][0]
        lines.append(
            f"- Anomaly: a {a['amount_display']} charge to {a['counterparty_name'] or a['category']} "
            f"is well above the usual {_naira(a['category_avg_kobo'])} for {a['category']}."
        )

    if insights["goals_at_risk"]:
        lines.append(f"- {insights['goals_at_risk'][0]['message']} Goals at risk: " +
                      ", ".join(g["name"] for g in insights["goals_at_risk"]))

    return "\n".join(lines)
