"""
Monnify integration layer (Zuri).

Every real money movement traces to a Monnify sandbox API. This module:

  - handles Monnify auth (bearer token, cached, refreshed on 401)
  - verifies Nigerian bank accounts (Name Inquiry)
  - provisions customer reserved accounts on signup
  - initiates single transfers (disbursements)
  - reads wallet balance
  - verifies inbound webhook signatures (HMAC-SHA512)

It is keyed entirely from environment variables and degrades to a "demo mode"
when no MONNIFY_* keys are present, so the app bootstraps and demos without
credentials (matching the demo-account pattern already used across Zuri).
"""

import os
import time
import hmac
import hashlib
import base64
import requests

MONNIFY_BASE_URL = os.getenv("MONNIFY_BASE_URL", "https://sandbox.monnify.com")
MONNIFY_API_KEY = os.getenv("MONNIFY_API_KEY", "")
MONNIFY_SECRET_KEY = os.getenv("MONNIFY_SECRET_KEY", "")
MONNIFY_CONTRACT_CODE = os.getenv("MONNIFY_CONTRACT_CODE", "")
# Disbursement wallet account number / reference, from Dashboard > Disbursement.
# Required for wallet-balance reads and single transfers (walletId).
MONNIFY_WALLET_ACCOUNT_NUMBER = os.getenv("MONNIFY_WALLET_ACCOUNT_NUMBER", "")

DEMO_MODE = not (MONNIFY_API_KEY and MONNIFY_SECRET_KEY) or os.getenv("FORCE_DEMO", "").lower() in ("1", "true", "yes", "on")

_token = {"value": None, "expires_at": 0}


class MonnifyError(Exception):
    """Raised when a Monnify API call fails or returns an error status."""

    def __init__(self, message: str, status: str = "failed", reference: str = None):
        super().__init__(message)
        self.status = status
        self.reference = reference


def _basic_auth_header() -> str:
    raw = f"{MONNIFY_API_KEY}:{MONNIFY_SECRET_KEY}"
    return "Basic " + base64.b64encode(raw.encode()).decode()


def get_token(force: bool = False) -> str:
    """Return a valid bearer token, caching it and refreshing on expiry/401."""
    if not force and _token["value"] and time.time() < _token["expires_at"]:
        return _token["value"]

    resp = requests.post(
        f"{MONNIFY_BASE_URL}/api/v1/auth/login",
        headers={
            "Authorization": _basic_auth_header(),
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    payload = _parse(resp, context="Monnify auth login")
    body = payload.get("responseBody") or {}

    # Sandbox tokens are valid for an hour; cache with a small buffer.
    expires_in = int(body.get("expiresIn", 3600)) or 3600
    token = (body.get("accessToken") or "").strip()
    if not token:
        raise MonnifyError("Could not authenticate with Monnify", status="auth_error")

    _token["value"] = token
    _token["expires_at"] = time.time() + max(expires_in - 300, 60)
    return token


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {get_token()}",
        "Content-Type": "application/json",
    }


def _parse(resp: requests.Response, context: str = "Monnify API") -> dict:
    try:
        payload = resp.json()
    except ValueError:
        payload = {}
    if resp.status_code >= 400 or not payload.get("requestSuccessful", False):
        message = (
            payload.get("responseMessage")
            or payload.get("message")
            or f"{context} failed (HTTP {resp.status_code})"
        )
        raise MonnifyError(str(message), status="monnify_error")
    return payload


def _auth_aware(method, url, **kwargs):
    """Run a Monnify request, refreshing the token once on a 401."""
    kwargs.setdefault("headers", _headers())
    for attempt in (0, 1):
        resp = method(url, timeout=20, **kwargs)
        if resp.status_code == 401 and attempt == 0:
            kwargs["headers"] = {"Authorization": f"Bearer {get_token(force=True)}", **kwargs["headers"]}
            continue
        return resp
    return resp


def verify_account(account_number: str, bank_code: str) -> dict:
    """Verify a Nigerian bank account (Name Inquiry). Returns real account name."""
    resp = _auth_aware(
        requests.get,
        f"{MONNIFY_BASE_URL}/api/v1/disbursements/account/validate",
        params={"accountNumber": account_number, "bankCode": bank_code},
    )
    payload = _parse(resp, context="Account verification")
    body = payload.get("responseBody") or {}
    account_name = (body.get("accountName") or "").strip()
    if not account_name:
        raise MonnifyError("Could not resolve account name", status="verify_failed")
    return {
        "account_number": account_number,
        "bank_code": bank_code,
        "account_name": account_name,
        "is_valid": True,
    }


def create_reserved_account(
    account_reference: str,
    account_name: str,
    email: str = None,
    bvn: str = None,
    nin: str = None,
    preferred_banks: list = None,
) -> dict:
    """Provision a customer reserved account for a user on signup."""
    payload = {
        "accountReference": account_reference,
        "accountName": account_name,
        "currencyCode": "NGN",
        "contractCode": MONNIFY_CONTRACT_CODE,
        "customerEmail": email or "",
        "customerName": account_name,
        "bvn": bvn,
        "nin": nin,
        "getAllAvailableBanks": True,
        "preferredBanks": preferred_banks or ["50515"],
    }

    def send():
        return _auth_aware(
            requests.post,
            f"{MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts",
            json=payload,
        )

    resp = send()
    try:
        data = _parse(resp, context="Reserved account creation")
    except MonnifyError:
        # Sandbox may require a BVN; retry with a known sandbox test BVN once.
        if not bvn:
            payload["bvn"] = "12345678901"
            resp = send()
            data = _parse(resp, context="Reserved account creation")
        else:
            raise

    body = data.get("responseBody") or {}
    accounts = body.get("accounts") or []
    if not accounts:
        accounts = [body]
    if not accounts or not accounts[0].get("accountNumber"):
        raise MonnifyError("No reserved account number returned", status="reserve_failed")
    return {
        "account_number": accounts[0].get("accountNumber"),
        "account_reference": accounts[0].get("accountReference") or account_reference,
        "bank_name": accounts[0].get("bankName") or "Wema Bank",
        "account_name": accounts[0].get("accountName") or account_name,
    }


def wallet_balance(wallet_account_number: str = None) -> int:
    """Return the Monnify wallet balance in kobo (NGN * 100)."""
    wallet_account_number = wallet_account_number or MONNIFY_WALLET_ACCOUNT_NUMBER
    if not wallet_account_number:
        raise MonnifyError(
            "MONNIFY_WALLET_ACCOUNT_NUMBER not configured (Dashboard > Disbursement)",
            status="config_error",
        )
    resp = _auth_aware(
        requests.get,
        f"{MONNIFY_BASE_URL}/api/v2/disbursements/wallet-balance",
        params={"accountNumber": wallet_account_number},
    )
    data = _parse(resp, context="Wallet balance")
    body = data.get("responseBody") or {}
    amount = body.get("availableBalance") or body.get("ledgerBalance") or 0
    # Monnify returns whole Naira; store as kobo internally.
    return int(round(float(amount) * 100))


def transfer(
    amount_kobo: int,
    account_number: str,
    bank_code: str,
    reference: str,
    narration: str = "",
    account_name: str = None,
    source_account_number: str = None,
) -> dict:
    """Initiate a single transfer (disbursement). Idempotent on `reference`.

    `account_name` is the verified beneficiary name (from Name Inquiry) and is
    required by Monnify (`destinationAccountName`). `source_account_number` is
    the merchant's disbursement wallet account number.
    """
    source_account_number = source_account_number or MONNIFY_WALLET_ACCOUNT_NUMBER
    if not source_account_number:
        raise MonnifyError(
            "MONNIFY_WALLET_ACCOUNT_NUMBER not configured (Dashboard > Disbursement)",
            status="config_error",
        )
    amount_naira = amount_kobo / 100
    payload = {
        "amount": amount_naira,
        "reference": reference,
        "narration": narration or f"Zuri transfer {reference[-6:]}",
        "currency": "NGN",
        "destinationBankCode": bank_code,
        "destinationAccountNumber": account_number,
        "destinationAccountName": account_name or "",
        "sourceAccountNumber": source_account_number,
    }
    if not payload["destinationAccountName"]:
        raise MonnifyError(
            "Beneficiary account name is required for transfer (verify first)",
            status="verify_required",
        )
    resp = _auth_aware(
        requests.post,
        f"{MONNIFY_BASE_URL}/api/v2/disbursements/single",
        json=payload,
    )
    data = _parse(resp, context="Transfer initiation")
    body = data.get("responseBody") or {}
    return {
        "reference": body.get("reference") or reference,
        "status": body.get("status") or "PENDING",
        "amount_kobo": amount_kobo,
        "account_number": account_number,
        "bank_code": bank_code,
    }


def verify_webhook_signature(raw_body: bytes, received_hash: str) -> bool:
    """Verify a Monnify webhook signature (HMAC-SHA512 of the raw body)."""
    if not MONNIFY_SECRET_KEY:
        return False
    expected = hmac.new(
        MONNIFY_SECRET_KEY.encode(),
        raw_body,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, received_hash or "")


def resend_otp(reference: str) -> dict:
    """Request a new OTP for a transfer awaiting authorization."""
    resp = _auth_aware(
        requests.post,
        f"{MONNIFY_BASE_URL}/api/v2/disbursements/single/resend-otp",
        json={"reference": reference},
    )
    data = _parse(resp, context="Resend OTP")
    body = data.get("responseBody") or {}
    return {"message": body.get("message") or "OTP sent", "reference": reference}


def authorize_transfer(reference: str, otp: str) -> dict:
    """Authorize a single transfer awaiting OTP (MFA)."""
    resp = _auth_aware(
        requests.post,
        f"{MONNIFY_BASE_URL}/api/v2/disbursements/single/validate-otp",
        json={"reference": reference, "authorizationCode": otp},
    )
    data = _parse(resp, context="Transfer authorization")
    body = data.get("responseBody") or {}
    return {
        "reference": body.get("reference") or reference,
        "status": body.get("status") or "COMPLETED",
        "amount_kobo": int(round(float(body.get("amount") or 0) * 100)),
    }


def get_transfer_status(reference: str) -> dict:
    """Fetch the status of a single transfer by reference."""
    resp = _auth_aware(
        requests.get,
        f"{MONNIFY_BASE_URL}/api/v2/disbursements/single/summary",
        params={"reference": reference},
    )
    data = _parse(resp, context="Transfer status")
    body = data.get("responseBody") or {}
    return {
        "reference": reference,
        "status": body.get("status") or "PENDING",
        "amount_kobo": int(round(float(body.get("amount") or 0) * 100)),
        "message": body.get("message") or data.get("responseMessage"),
    }


def create_mandate(
    *,
    mandate_reference: str,
    customer_name: str,
    customer_email: str,
    customer_phone: str,
    customer_address: str,
    customer_account_number: str,
    customer_bank_code: str,
    mandate_description: str,
    mandate_start_date: str,
    mandate_end_date: str,
) -> dict:
    """Initiate a direct-debit mandate (async; customer must authorize to activate)."""
    payload = {
        "contractCode": MONNIFY_CONTRACT_CODE,
        "mandateReference": mandate_reference,
        "customerName": customer_name,
        "customerEmailAddress": customer_email,
        "customerPhoneNumber": customer_phone,
        "customerAddress": customer_address,
        "customerAccountNumber": customer_account_number,
        "customerAccountBankCode": customer_bank_code,
        "mandateDescription": mandate_description,
        "mandateStartDate": mandate_start_date,
        "mandateEndDate": mandate_end_date,
        "autoRenew": True,
        "customerCancellation": False,
    }
    resp = _auth_aware(
        requests.post,
        f"{MONNIFY_BASE_URL}/api/v1/direct-debit/mandate/create",
        json=payload,
    )
    data = _parse(resp, context="Mandate creation")
    body = data.get("responseBody") or {}
    return {
        "mandate_code": body.get("mandateCode"),
        "mandate_reference": body.get("mandateReference") or mandate_reference,
        "mandate_status": body.get("mandateStatus") or "INITIATED",
        "message": body.get("responseMessage") or data.get("responseMessage"),
        "redirect_url": body.get("redirectUrl"),
    }


def debit_mandate(
    *,
    mandate_code: str,
    payment_reference: str,
    debit_amount_kobo: int,
    narration: str,
    customer_email: str,
) -> dict:
    """Debit an active mandate (deposits into a Zuri goal / wallet)."""
    payload = {
        "paymentReference": payment_reference,
        "mandateCode": mandate_code,
        "debitAmount": debit_amount_kobo / 100,
        "narration": narration,
        "customerEmail": customer_email,
    }
    resp = _auth_aware(
        requests.post,
        f"{MONNIFY_BASE_URL}/api/v1/direct-debit/mandate/debit",
        json=payload,
    )
    data = _parse(resp, context="Mandate debit")
    body = data.get("responseBody") or {}
    return {
        "transaction_status": body.get("transactionStatus") or "PENDING",
        "transaction_reference": body.get("transactionReference"),
        "mandate_code": mandate_code,
        "message": body.get("responseMessage") or data.get("responseMessage"),
    }
