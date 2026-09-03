import json
from typing import Optional

from fastapi import APIRouter, Request, Response, Header

from ..database import get_db
from ..services import monnify, ledger_service

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


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
        if amount_kobo > 0 and payment_reference:
            conn = get_db()
            try:
                user_id = _find_user(conn.cursor(), event_data)
            finally:
                conn.close()

            if user_id is not None:
                ledger_service.record_monnify_credit(
                    user_id=user_id,
                    monnify_ref=payment_reference,
                    amount_kobo=amount_kobo,
                    counterparty_name=(event_data.get("customer") or {}).get("name"),
                )

    # Always acknowledge with 200 so Monnify does not retry.
    return Response(status_code=200, content="OK")
