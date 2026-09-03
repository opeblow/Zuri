import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request, Response, Header

from ..database import get_db
from ..services import monnify

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Monnify production webhook IP (sandbox origin differs; keep as a reference).
MONNIFY_WEBHOOK_IPS = {"35.242.133.146"}


def _find_user(cursor, event_data: dict) -> Optional[int]:
    """Map a Monnify reserved-account payment to a Zuri user.

    Monnify's reserved-account payload carries the accountReference in
    product.reference and the virtual account number in
    destinationAccountInformation.accountNumber.
    """
    product = event_data.get("product") or {}
    account_ref = product.get("reference")
    if account_ref:
        cursor.execute(
            "SELECT user_id FROM accounts WHERE monnify_account_ref = ?",
            (account_ref,),
        )
        row = cursor.fetchone()
        if row:
            return row["user_id"]

    dest = event_data.get("destinationAccountInformation") or {}
    account_number = dest.get("accountNumber") or dest.get("vAccountNumber")
    if account_number:
        cursor.execute(
            "SELECT user_id FROM accounts WHERE monnify_reserved_account = ?",
            (account_number,),
        )
        row = cursor.fetchone()
        if row:
            return row["user_id"]
    return None


@router.post("/monnify")
async def monnify_webhook(
    request: Request,
    monnify_signature: Optional[str] = Header(None, alias="monnify-signature"),
):
    """Receive and process Monnify webhook notifications (e.g. reserved-account top-ups)."""
    raw = await request.body()
    remote_ip = request.client.host if request.client else ""

    # Production requests carry the monnify-signature header; sandbox does not.
    if monnify_signature and not monnify.verify_webhook_signature(raw, monnify_signature):
        return Response(status_code=401, content="Invalid signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return Response(status_code=400, content="Malformed payload")

    event_type = payload.get("eventType")
    event_data = payload.get("eventData") or {}

    if event_type == "SUCCESSFUL_TRANSACTION" and event_data.get("paymentStatus") == "PAID":
        amount_paid = event_data.get("amountPaid")
        try:
            amount_kobo = int(round(float(amount_paid) * 100))
        except (TypeError, ValueError):
            amount_kobo = 0

        payment_reference = event_data.get("paymentReference") or event_data.get("transactionReference") or ""
        if amount_kobo > 0:
            conn = get_db()
            try:
                conn.execute("BEGIN IMMEDIATE")
                cursor = conn.cursor()
                user_id = _find_user(cursor, event_data)

                if user_id is not None:
                    # Dedup: ignore if we already recorded this payment reference.
                    cursor.execute(
                        "SELECT id FROM transactions WHERE user_id = ? AND monnify_ref = ?",
                        (user_id, payment_reference),
                    )
                    if not cursor.fetchone():
                        cursor.execute(
                            "UPDATE accounts SET balance_kobo = balance_kobo + ? WHERE user_id = ?",
                            (amount_kobo, user_id),
                        )
                        cursor.execute(
                            """INSERT INTO transactions
                               (user_id, monnify_ref, direction, amount_kobo, counterparty_name, category, status, timestamp)
                               VALUES (?, ?, 'credit', ?, ?, 'income', 'completed', ?)""",
                            (
                                user_id,
                                payment_reference,
                                amount_kobo,
                                event_data.get("customer", {}).get("name") or "Wallet Top-up",
                                datetime.utcnow().isoformat(),
                            ),
                        )
                conn.commit()
            finally:
                conn.close()

    # Always acknowledge with 200 so Monnify does not retry.
    return Response(status_code=200, content="OK")
