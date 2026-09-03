import os
from datetime import datetime
from openai import OpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are Zuri, an intelligent AI financial assistant for a Nigerian fintech app.
You help users manage their money, track spending, set goals, send money, and make smart financial decisions.

Key context:
- Currency is Nigerian Naira (NGN), amounts are discussed in Naira
- Users can set savings goals, send money to beneficiaries, track expenses
- You are friendly, concise, and speak in a mix of English and Nigerian Pidgin when appropriate
- Keep responses under 200 words unless the user asks for detail

You have real-time access to this user's account inside the <user_account> block.
Use that data as the single source of truth for anything about their balance, spending,
transactions, goals, or beneficiaries. Quote real numbers from it. Do not invent figures.
If the data you need is not present in <user_account>, say you can't see it, and tell them
where to find it in the app, or which command to use.

You can also TAKE ACTION for the user via the provided tools:
- send_transfer: send money to a SAVED beneficiary (by nickname or full name). Use the amount
  the user stated; if they didn't state an amount, use the beneficiary's usual/saved amount.
- create_goal: create a savings goal and compute a monthly saving pace.

Be DECISIVE about actions - this is a working app, not a mock. When the user clearly asks to
send money to a saved beneficiary, call send_transfer immediately and report the result. Do not
ask for confirmation for a straightforward send; only ask a clarifying question if the recipient
cannot be identified as a saved beneficiary or the amount is genuinely missing.
<user_account>
{account_context}
</user_account>
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_transfer",
            "description": "Send money from the user's Zuri wallet to a saved beneficiary.",
            "parameters": {
                "type": "object",
                "properties": {
                    "beneficiary": {
                        "type": "string",
                        "description": "Nickname or full name of the saved beneficiary, e.g. 'Mummy'.",
                    },
                    "amount_naira": {
                        "type": "number",
                        "description": "Amount in Naira. Omit to use the beneficiary's usual saved amount.",
                    },
                },
                "required": ["beneficiary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_goal",
            "description": "Create a savings goal and compute a monthly saving amount.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Goal name, e.g. 'Rent 2027'."},
                    "target_amount_naira": {
                        "type": "number",
                        "description": "Total target amount in Naira.",
                    },
                    "months": {
                        "type": "number",
                        "description": "Number of months to reach the goal (default 12).",
                    },
                },
                "required": ["name", "target_amount_naira"],
            },
        },
    },
]

client = None


def get_client():
    global client
    if client is None:
        client = OpenAI(api_key=OPENAI_API_KEY)
    return client


def _naira(k):
    return f"\u20a6{k / 100:,.2f}" if k is not None else "\u20a60.00"


def build_user_context(user_id: int) -> str:
    """Gather the user's current financial data into a readable summary for the AI."""
    from ..database import get_db

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT balance_kobo, monnify_reserved_account, bank_name FROM accounts WHERE user_id = ?",
        (user_id,),
    )
    account = cursor.fetchone()

    cursor.execute(
        """SELECT direction, amount_kobo, counterparty_name, category, status, timestamp
           FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 12""",
        (user_id,),
    )
    transactions = cursor.fetchall()

    cursor.execute(
        """SELECT name, current_amount_kobo, target_amount_kobo, recurring_amount_kobo, status
           FROM goals WHERE user_id = ?""",
        (user_id,),
    )
    goals = cursor.fetchall()

    cursor.execute(
        "SELECT nickname, full_name, usual_amount_kobo FROM beneficiaries WHERE user_id = ?",
        (user_id,),
    )
    beneficiaries = cursor.fetchall()

    conn.close()

    lines = []
    if account:
        lines.append(f"Available balance: {_naira(account['balance_kobo'])}")
        lines.append(f"Account number: {account['monnify_reserved_account'] or 'n/a'}")
        lines.append(f"Bank: {account['bank_name'] or 'n/a'}")
    else:
        lines.append("Available balance: n/a (no account)")

    if transactions:
        lines.append("\nRecent transactions:")
        for tx in transactions:
            sign = "+" if tx["direction"] == "credit" else "-"
            st = tx["status"] or "completed"
            lines.append(
                f"- {tx['timestamp'][:10]} {sign}{_naira(tx['amount_kobo'])} "
                f"{tx['counterparty_name'] or tx['category'] or 'transfer'} ({st})"
            )

    if goals:
        lines.append("\nSavings goals:")
        for g in goals:
            lines.append(
                f"- {g['name']} ({g['status']}): {_naira(g['current_amount_kobo'])} / "
                f"{_naira(g['target_amount_kobo'])} target, recurring {_naira(g['recurring_amount_kobo'])}"
            )

    if beneficiaries:
        lines.append("\nSaved beneficiaries:")
        for b in beneficiaries:
            lines.append(
                f"- {b['nickname'] or b['full_name']} ({b['full_name']})"
                f"{f', usual {_naira(b['usual_amount_kobo'])}' if b['usual_amount_kobo'] else ''}"
            )

    if not lines:
        lines.append("No account data on record yet.")

    return "\n".join(lines)


def execute_tool(name: str, args: dict, user_id: int) -> dict:
    """Execute an AI tool call against the user's real data. Returns a result dict + a
    human-readable confirmation message."""
    from ..database import get_db

    if name == "send_transfer":
        beneficiary_key = str(args.get("beneficiary", "")).strip().lower()
        if not beneficiary_key:
            return {"ok": False, "message": "No beneficiary provided.", "reply": "Which person should I send money to?"}
        return _execute_transfer(user_id, beneficiary_key, args.get("amount_naira"))
    elif name == "create_goal":
        return _execute_create_goal(user_id, args)
    return {"ok": False, "message": f"Unknown tool {name}.", "reply": "I couldn't do that."}


def _execute_transfer(user_id: int, beneficiary_key: str, amount_naira):
    from ..database import get_db
    from ..services import monnify

    amount_naira = amount_naira or 0

    conn = get_db()
    conn.execute("BEGIN IMMEDIATE")
    cursor = conn.cursor()
    try:
        cursor.execute(
            """SELECT id, nickname, full_name, account_number, bank_code, usual_amount_kobo
               FROM beneficiaries
               WHERE user_id = ? AND (LOWER(nickname) = ? OR LOWER(full_name) = ?)""",
            (user_id, beneficiary_key, beneficiary_key),
        )
        ben = cursor.fetchone()
        if not ben:
            conn.rollback()
            return {
                "ok": False,
                "reply": f"I couldn't find a saved beneficiary matching '{beneficiary_key}'. "
                "Add them under Beneficiaries first, then ask me again.",
            }

        name = ben["nickname"] or ben["full_name"]

        amount_kobo = int(round(float(amount_naira) * 100)) if amount_naira else (ben["usual_amount_kobo"] or 0)
        if amount_kobo <= 0:
            conn.rollback()
            return {
                "ok": False,
                "reply": f"How much should I send to {name}? I don't have a usual amount saved for them.",
            }

        cursor.execute("SELECT balance_kobo FROM accounts WHERE user_id = ?", (user_id,))
        account = cursor.fetchone()
        if not account:
            conn.rollback()
            return {"ok": False, "reply": "I couldn't find your account."}
        if account["balance_kobo"] < amount_kobo:
            conn.rollback()
            return {
                "ok": False,
                "reply": f"You don't have enough balance to send {_naira(amount_kobo)}. "
                f"Your balance is {_naira(account['balance_kobo'])}. Tap 'Top up' to add money.",
            }

        reference = f"MON-AI-{int(datetime.utcnow().timestamp() * 1000)}"

        if monnify.DEMO_MODE:
            cursor.execute(
                "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
                (amount_kobo, user_id),
            )
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'debit', ?, ?, 'transfers', 'completed', ?)""",
                (user_id, reference, amount_kobo, ben["full_name"], datetime.utcnow().isoformat()),
            )
        else:
            cursor.execute(
                "UPDATE accounts SET balance_kobo = balance_kobo - ? WHERE user_id = ?",
                (amount_kobo, user_id),
            )
            cursor.execute(
                """INSERT INTO transactions (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                   VALUES (?, ?, 'debit', ?, ?, 'transfers', 'completed', ?)""",
                (user_id, reference, amount_kobo, ben["full_name"], datetime.utcnow().isoformat()),
            )

        conn.commit()
        return {
            "ok": True,
            "reply": (
                f"Done! I sent {_naira(amount_kobo)} to {name} "
                f"({ben['full_name']}). Your new balance is {_naira(account['balance_kobo'] - amount_kobo)}."
            ),
        }
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        return {"ok": False, "reply": f"I couldn't complete that transfer: {str(e)}"}


def _execute_create_goal(user_id: int, args: dict):
    from ..database import get_db

    name = str(args.get("name", "")).strip()
    target_naira = float(args.get("target_amount_naira") or 0)
    months = int(args.get("months") or 12) or 1
    if not name or target_naira <= 0:
        return {"ok": False, "reply": "Tell me the goal name and the target amount, e.g. 'Rent for ₦600,000'."}

    conn = get_db()
    cursor = conn.cursor()
    target_kobo = int(round(target_naira * 100))
    recurring_kobo = -(-target_kobo // months)

    cursor.execute(
        """INSERT INTO goals (user_id, name, current_amount_kobo, target_amount_kobo, recurring_amount_kobo, status)
           VALUES (?, ?, 0, ?, ?, 'active')""",
        (user_id, name, target_kobo, recurring_kobo),
    )
    goal_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "ok": True,
        "goal_id": goal_id,
        "reply": (
            f"Goal '{name}' created! Target {_naira(target_kobo)}, saving about "
            f"{_naira(recurring_kobo)} a month to reach it in {months} month(s)."
        ),
    }


def run_agent(user_message: str, user_id: int, conversation_history: list = None) -> str:
    """Full agentic loop: reply, and if the model requests a tool, execute it against the
    user's real data and return a natural confirmation."""
    api_client = get_client()

    system_prompt = SYSTEM_PROMPT.format(account_context=build_user_context(user_id))

    messages = [{"role": "system", "content": system_prompt}]
    if conversation_history:
        for msg in conversation_history[-10:]:
            messages.append({"role": msg["role"], "content": msg["text"]})
    messages.append({"role": "user", "content": user_message})

    try:
        response = api_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            max_tokens=500,
            temperature=0.6,
            timeout=25,
        )
        message = response.choices[0].message

        if not message.tool_calls:
            return message.content or "I'm not sure how to respond to that."

        tool_feedbacks = []
        tool_messages = [{"role": "assistant", "content": message.content or "", "tool_calls": [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in message.tool_calls
        ]}]

        for tc in message.tool_calls:
            import json
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            result = execute_tool(tc.function.name, args, user_id)
            tool_feedbacks.append(result["reply"])
            tool_messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result["reply"],
            })

        final = api_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages + tool_messages,
            max_tokens=400,
            temperature=0.6,
            timeout=25,
        )
        content = final.choices[0].message.content
        if content and content.strip():
            return content.strip()
        if tool_feedbacks:
            return "\n".join(tool_feedbacks)
        return "Done."
    except Exception as e:
        return f"I'm having trouble connecting right now. Please try again in a moment. Error: {str(e)}"


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    api_client = get_client()

    try:
        audio_file = (filename, audio_bytes, "audio/wav")
        response = api_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
        return response.text
    except Exception as e:
        return f"[Transcription error: {str(e)}]"
