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
    account_number: str
    bank_name: str


# --- Beneficiary Schemas ---
class BeneficiaryCreate(BaseModel):
    nickname: Optional[str] = None
    full_name: str
    account_number: str
    bank_code: str

class BeneficiaryResponse(BaseModel):
    id: int
    nickname: Optional[str]
    full_name: str
    account_number: str
    bank_code: str
    send_count: int
    usual_amount_kobo: int

class BankResolveRequest(BaseModel):
    account_number: str
    bank_code: str

class BankResolveResponse(BaseModel):
    account_number: str
    account_name: str
    bank_name: str


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

class GoalMandateCreateRequest(BaseModel):
    account_number: str
    bank_code: str
    address: Optional[str] = "Zuri, Nigeria"
    recurring_amount_kobo: Optional[int] = None

class GoalAutoSaveRequest(BaseModel):
    amount_kobo: int

class GoalResponse(BaseModel):
    id: int
    name: str
    current_amount_kobo: int
    target_amount_kobo: int
    target_date: Optional[str]
    recurring_amount_kobo: int
    status: str


# --- Transaction Schemas ---
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

class TransferRequest(BaseModel):
    category: str = "transfers"
    amount_kobo: int = Field(gt=0)
    counterparty_name: str
    account_number: Optional[str] = None
    bank_code: Optional[str] = None
    pin: str

class TransferAuthorizeRequest(BaseModel):
    reference: str
    otp: str


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

class ConversationResponse(BaseModel):
    role: str
    text: str
    timestamp: str
