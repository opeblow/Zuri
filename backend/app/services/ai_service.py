import os
from datetime import datetime
from openai import OpenAI

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SYSTEM_PROMPT = """You are Zuri, a voice-native money diary for Nigeria. You are NOT a bank and
you never touch a real bank account — Zuri only knows what the user tells it. When someone
says "I just got paid 200k" or "spent 3k on fuel", you log it; that log is the entire source
of the numbers you see. Your job is to make that self-reported money "speak out loud": what
was spent, why it changed, whether they're about to run low, and what to do about it.

Key context:
- Currency is Nigerian Naira (NGN), amounts are discussed in Naira
- Everything in <user_account> comes from entries the user or onboarding logged — never assume
  it's synced with a real bank; some early history may be an approximation from onboarding
- You are friendly, concise, and speak in a mix of English and Nigerian Pidgin when appropriate
- Keep responses under 200 words unless the user asks for detail
- Since replies are often read aloud, favour short, spoken-style sentences over lists of numbers

You have real-time access to this user's diary inside the <user_account> block, including a
"Spending insights" section that is pre-computed (burn rate, runway, category breakdown,
recurring charges, anomalies, goal risk) — not your own estimate. Always quote those exact
figures rather than inventing or recalculating them. If something isn't in <user_account>, say
you can't see it and tell the user where to find it in the app.

You can also TAKE ACTION for the user via the provided tools:
- log_transaction: record something the user earned or spent. This is the core interaction —
  when the user mentions any income or expense in plain language, log it immediately.
- create_goal: create a savings goal and compute a monthly saving pace.
- send_money: prepare a real transfer to a saved, Monnify-verified beneficiary (e.g. "send 5k to
  Mummy"). This never moves money by itself — it only looks up the beneficiary and hands off to a
  PIN confirmation the user completes in the app. Voice/chat can NEVER send to someone who isn't
  already a saved beneficiary; if the name isn't recognised, tell the user to add them as a
  beneficiary first, in the Beneficiaries screen.

Be DECISIVE about actions - this is a working app, not a mock. When the user states an amount
they earned or spent, call log_transaction right away and confirm what you logged; only ask a
clarifying question if the amount is genuinely missing. Otherwise, lean into being a spending
coach: explain trends, flag anomalies and recurring charges, warn about runway, and suggest
concrete adjustments.
<user_account>
{account_context}
</user_account>
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "log_transaction",
            "description": "Record money the user earned (income) or spent (expense) in their diary.",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "enum": ["income", "expense"],
                        "description": "'income' if money came in, 'expense' if money went out.",
                    },
                    "amount_naira": {"type": "number", "description": "Amount in Naira."},
                    "category": {
                        "type": "string",
                        "description": "e.g. transport, lifestyle, bills, shopping, income, other.",
                    },
                    "note": {"type": "string", "description": "Short description, e.g. 'Uber to work' or 'Salary'."},
                },
                "required": ["direction", "amount_naira"],
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
    {
        "type": "function",
        "function": {
            "name": "send_money",
            "description": "Look up a saved beneficiary by nickname and prepare a real Monnify transfer, pending PIN confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "beneficiary_nickname": {"type": "string", "description": "e.g. 'Mummy', 'Ada', 'landlord'."},
                    "amount_naira": {"type": "number", "description": "Amount in Naira."},
                },
                "required": ["beneficiary_nickname", "amount_naira"],
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
        "SELECT balance_kobo FROM accounts WHERE user_id = ?",
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

    conn.close()

    lines = []
    if account:
        lines.append(f"Current diary balance: {_naira(account['balance_kobo'])}")
    else:
        lines.append("Current diary balance: n/a (no account)")

    if transactions:
        lines.append("\nRecent logged entries:")
        for tx in transactions:
            sign = "+" if tx["direction"] == "credit" else "-"
            st = tx["status"] or "completed"
            lines.append(
                f"- {tx['timestamp'][:10]} {sign}{_naira(tx['amount_kobo'])} "
                f"{tx['counterparty_name'] or tx['category'] or 'entry'} ({st})"
            )

    if goals:
        lines.append("\nSavings goals:")
        for g in goals:
            lines.append(
                f"- {g['name']} ({g['status']}): {_naira(g['current_amount_kobo'])} / "
                f"{_naira(g['target_amount_kobo'])} target, recurring {_naira(g['recurring_amount_kobo'])}"
            )

    if not lines:
        lines.append("No account data on record yet.")

    from .insights_service import compute_insights, summarize_insights_for_ai
    try:
        lines.append("\n" + summarize_insights_for_ai(compute_insights(user_id)))
    except Exception:
        pass

    return "\n".join(lines)


def execute_tool(name: str, args: dict, user_id: int) -> dict:
    """Execute an AI tool call against the user's real data. Returns a result dict + a
    human-readable confirmation message."""
    if name == "log_transaction":
        return _execute_log_transaction(user_id, args)
    if name == "create_goal":
        return _execute_create_goal(user_id, args)
    if name == "send_money":
        return _execute_send_money(user_id, args)
    return {"ok": False, "message": f"Unknown tool {name}.", "reply": "I couldn't do that."}


def _execute_log_transaction(user_id: int, args: dict):
    from .ledger_service import log_entry

    direction = "credit" if str(args.get("direction", "")).lower() == "income" else "debit"
    amount_naira = args.get("amount_naira") or 0
    category = str(args.get("category") or ("income" if direction == "credit" else "other")).lower()
    note = args.get("note")

    amount_kobo = int(round(float(amount_naira) * 100))
    if amount_kobo <= 0:
        return {"ok": False, "reply": "How much was that? I need an amount to log it."}

    result = log_entry(user_id, direction, amount_kobo, category, note)
    verb = "Logged income of" if direction == "credit" else "Logged an expense of"
    return {
        "ok": True,
        "reply": f"{verb} {_naira(amount_kobo)}{f' ({note})' if note else ''}. New balance: {result['new_balance_display']}.",
    }


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


def _execute_send_money(user_id: int, args: dict):
    from ..database import get_db

    nickname = str(args.get("beneficiary_nickname", "")).strip().lower()
    amount_naira = float(args.get("amount_naira") or 0)
    amount_kobo = int(round(amount_naira * 100))
    if not nickname or amount_kobo <= 0:
        return {"ok": False, "reply": "Who should I send to, and how much?"}

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, nickname, full_name FROM beneficiaries WHERE user_id = ? AND LOWER(nickname) LIKE ?",
        (user_id, f"%{nickname}%"),
    )
    beneficiary = cursor.fetchone()
    conn.close()

    if not beneficiary:
        return {
            "ok": False,
            "reply": f"I don't have '{args.get('beneficiary_nickname')}' saved as a beneficiary yet. "
                     f"Add them in the Beneficiaries screen first — Zuri only sends to verified, saved people.",
        }

    return {
        "ok": True,
        "reply": (
            f"Ready to send {_naira(amount_kobo)} to {beneficiary['nickname']} ({beneficiary['full_name']}). "
            f"Confirm with your PIN in the app to complete it."
        ),
        "pending_transfer": {
            "beneficiary_id": beneficiary["id"],
            "beneficiary_nickname": beneficiary["nickname"],
            "beneficiary_full_name": beneficiary["full_name"],
            "amount_kobo": amount_kobo,
        },
    }


def run_agent(user_message: str, user_id: int, conversation_history: list = None) -> tuple:
    """Full agentic loop: reply, and if the model requests a tool, execute it against the
    user's real data and return a natural confirmation. Returns (reply_text, pending_transfer)
    — pending_transfer is set only when send_money resolved a beneficiary and is awaiting the
    user's PIN confirmation in the app; it never means money has actually moved."""
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
            return message.content or "I'm not sure how to respond to that.", None

        tool_feedbacks = []
        pending_transfer = None
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
            if result.get("pending_transfer"):
                pending_transfer = result["pending_transfer"]
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
        text = content.strip() if content and content.strip() else ("\n".join(tool_feedbacks) if tool_feedbacks else "Done.")
        return text, pending_transfer
    except Exception as e:
        return f"I'm having trouble connecting right now. Please try again in a moment. Error: {str(e)}", None


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    api_client = get_client()

    try:
        audio_file = (filename, audio_bytes, "audio/webm")
        response = api_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            # Biases decoding toward the app's domain (Naira amounts, spending
            # talk, Nigerian English/Pidgin) without forcing a single language.
            prompt=(
                "Nigerian money diary app. The speaker talks about naira amounts, "
                "income, expenses, savings goals, in English, Pidgin, Yoruba, Igbo or Hausa."
            ),
            temperature=0,
        )
        return response.text.strip()
    except Exception as e:
        return f"[Transcription error: {str(e)}]"


def synthesize_speech(text: str):
    """Text -> spoken audio bytes (MP3) via OpenAI TTS. Returns None on any failure so
    callers can fall back to client-side speech synthesis instead of erroring out."""
    if not text or not text.strip():
        return None
    try:
        api_client = get_client()
        response = api_client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text[:1000],
        )
        return response.content
    except Exception:
        return None
