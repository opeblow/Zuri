from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# --- Auth Schemas ---
class SignupRequest(BaseModel):
    phone: str
    email: Optional[str] = None
    full_name: str
    password: str
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
    language_pref: str = "en"

class LoginRequest(BaseModel):
    phone: str
    pin: str

class VerifyPinRequest(BaseModel):
    pin: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int


# --- Account Schemas ---
class AccountResponse(BaseModel):
    user_id: int
    full_name: str
    balance_kobo: int
    balance_display: str
    monnify_reserved_account: Optional[str] = None
    bank_name: Optional[str] = None


# --- Onboarding Schemas ---
class RecurringExpenseInput(BaseModel):
    name: str
    amount_kobo: int = Field(gt=0)
    category: str = "bills"

class OnboardingSetupRequest(BaseModel):
    starting_balance_kobo: int = 0
    monthly_income_kobo: int = 0
    recurring_expenses: List[RecurringExpenseInput] = []


# --- Goal Schemas ---
class GoalCreate(BaseModel):
    name: str
    target_amount_kobo: int
    target_date: Optional[str] = None
    recurring_amount_kobo: int = 0

class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount_kobo: Optional[int] = None
    target_date: Optional[str] = None
    recurring_amount_kobo: Optional[int] = None
    status: Optional[str] = None

class GoalDepositRequest(BaseModel):
    amount_kobo: int

class GoalResponse(BaseModel):
    id: int
    name: str
    current_amount_kobo: int
    target_amount_kobo: int
    target_date: Optional[str]
    recurring_amount_kobo: int
    status: str


# --- Transaction / Ledger Schemas ---
class TransactionResponse(BaseModel):
    id: int
    monnify_ref: Optional[str]
    direction: str
    amount_kobo: int
    counterparty_name: Optional[str]
    category: str
    status: str
    timestamp: str

class TransactionUpdate(BaseModel):
    category: Optional[str] = None

class LogTransactionRequest(BaseModel):
    direction: str = Field(pattern=r"^(credit|debit)$")
    amount_kobo: int = Field(gt=0)
    category: str = "other"
    note: Optional[str] = None


# --- Beneficiary / Monnify Schemas ---
class BeneficiaryCreate(BaseModel):
    nickname: str
    full_name: str
    account_number: str
    bank_code: str

class BeneficiaryResponse(BaseModel):
    id: int
    nickname: str
    full_name: str
    account_number: str
    bank_code: str
    send_count: int

class BankResolveRequest(BaseModel):
    account_number: str
    bank_code: str

class BankResolveResponse(BaseModel):
    account_number: str
    account_name: str
    bank_name: str

class TransferRequest(BaseModel):
    beneficiary_id: int
    amount_kobo: int = Field(gt=0)
    pin: str
    narration: Optional[str] = None


# --- Settings Schemas ---
class ProfileUpdate(BaseModel):
    language_pref: Optional[str] = None
    daily_biometric_limit_kobo: Optional[int] = None
    biometric_enabled: Optional[bool] = None

class ChangePinRequest(BaseModel):
    old_pin: str
    new_pin: str


# --- Conversation Schemas ---
class ConversationTextRequest(BaseModel):
    text: str
    voice: bool = False

class ConversationResponse(BaseModel):
    role: str
    text: str
    timestamp: str
    audio_base64: Optional[str] = None
    pending_transfer: Optional[dict] = None
