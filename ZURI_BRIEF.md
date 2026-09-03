# ZURI

**Your money, out loud.**
Developer brief — APIConf Hackathon

| | |
|---|---|
| Product | Zuri — the conversational money app |
| Hackathon | APIConf Hackathon (Monnify APIs) |
| Stack | React + Vite (web), Python/FastAPI, SQLite |
| Rail | Monnify (Reserved Accounts, Transfer, Verify Bank Account, Webhooks) |
| AI layer | Whisper STT → OpenAI LLM (tool-calling) → OpenAI TTS |
| Demo language | English + Yoruba + Pidgin (Igbo/Hausa supported) |

---

## 1. What we are building

Zuri is a web app where a user talks to their money and their money talks
back. No taps, no menus, no dashboards. Just a conversation.

The user asks questions in English, Pidgin, Yoruba, Igbo or Hausa — like
*"how is my spending looking this month?"* or *"I just spent five thousand
naira on fuel"* — and Zuri answers with real numbers and real actions,
grounded in the user's actual transaction history: a mix of self-reported
entries and real inflows/outflows through the user's Monnify-backed account.

Every other Nigerian personal finance app makes the user the strategist and
the app the calculator. Zuri makes the app the strategist. The user just
talks to it.

### The killer demo moments

**Moment 1 — The rent question**
User: *"How should I pay my rent this year? It's ₦900k due in November."*
Zuri answers with a real plan grounded in the user's logged salary rhythm
and spending pattern, then creates a savings goal with a computed monthly
pace.

**Moment 2 — The salary-landed moment**
A real transfer lands in the user's Monnify reserved account mid-demo. Zuri
speaks up unprompted: *"Your salary just landed — ₦450,000. Before you do
anything, here's what's already committed…"* — then lists goal
contributions, recurring bills, and available balance.

**Moment 3 — The Yoruba moment**
User speaks in Yoruba: *"Ṣé mo ní owó tí mo lè fi rá phone tuntun báyìí?"*
("Do I have money to buy a new phone right now?") Zuri answers in Yoruba
with a real recommendation grounded in the current balance and goals.

## 2. Architecture at a glance

```
Frontend (React + Vite)
   |  REST + SSE
Backend (FastAPI)
   |-- routers/
   |     auth.py            signup, login, verify-pin, JWT guard
   |     account.py         balance, demo reset
   |     onboarding.py      seeds starting balance + recurring history
   |     beneficiaries.py   saved recipients, bank list, name resolution
   |     webhooks.py        Monnify inbound-payment notifications
   |     transactions.py    history, manual log, re-categorise
   |     goals.py           savings goal lifecycle
   |     insights.py        computed spend-intelligence endpoint
   |     conversation.py    chat + voice (text/audio), history
   |     settings.py        profile, PIN change, delete account
   |-- services/
   |     ledger_service.py       single source of truth for balance +
   |                              transaction bookkeeping — self-reported
   |                              entries and real Monnify credits both
   |                              flow through here
   |     insights_service.py     deterministic spend intelligence: runway,
   |                              burn rate, category breakdown, recurring
   |                              charges, anomalies, goal risk
   |     ai_service.py           chat agent, tool-calling, STT/TTS
   |     monnify.py              Monnify auth, reserved accounts, verify
   |                              account, wallet balance, transfer,
   |                              webhook signature validation, mandates
   |     auth_service.py         bcrypt PIN + JWT helpers
   |-- database.py         SQLite schema + migrations
SQLite (zuri.db)
```

### End-to-end flow: real money landing

1. Monnify sends a webhook to `POST /api/webhooks/monnify` when a payment
   hits the user's reserved account.
2. The signature is verified first — anything unverified is rejected.
3. The payload is matched to a user via their reserved account reference.
4. `ledger_service.record_monnify_credit()` posts the transaction and
   updates the balance — idempotent on Monnify's reference, so a retried
   webhook never double-credits.
5. The next time the user opens the conversation (or if a live channel is
   wired up), Zuri can react proactively: *"Your salary just landed…"*

### End-to-end flow: sending money

1. User says or types "send ₦5,000 to Mummy."
2. The LLM resolves this to a structured tool call — never free text into
   money movement — referencing a saved, Verify-Bank-Account-confirmed
   beneficiary.
3. Zuri asks for PIN confirmation, stating the recipient's verified name
   and the amount.
4. On confirmation, `POST /api/actions/transfer` calls Monnify's Single
   Transfer API.
5. The transfer reference is stored for idempotency; retries never
   double-send.

## 3. Data model (SQLite)

```
users            id, phone, email, full_name, language_pref, pin_hash,
                 password_hash, biometric_enabled, daily_biometric_limit_kobo

accounts         id, user_id, monnify_reserved_account, monnify_account_ref,
                 bank_name, balance_kobo

beneficiaries    id, user_id, nickname, full_name, account_number,
                 bank_code, send_count, usual_amount_kobo

transactions     id, user_id, monnify_ref, direction, amount_kobo,
                 counterparty_name, category, status, timestamp

goals            id, user_id, name, current_amount_kobo, target_amount_kobo,
                 target_date, recurring_amount_kobo, monnify_mandate_ref,
                 status

conversations    id, user_id, role, text, timestamp

automations      id, user_id, name, trigger_type, trigger_config,
                 action_type, action_config, active

idempotency_keys user_id, key, response_json, created_at
```

## 4. Backend endpoints

**Auth**
- `POST /api/auth/signup` — phone, email, name, language, PIN; provisions a
  Monnify reserved account behind the scenes
- `POST /api/auth/login` — phone + PIN → JWT
- `POST /api/auth/verify-pin`

**Onboarding**
- `POST /api/onboarding/setup` — starting balance, monthly income, recurring
  expenses; backdates a bit of history so insights aren't empty on day one

**Beneficiaries**
- `GET /api/beneficiaries/` — list
- `POST /api/beneficiaries/` — add
- `DELETE /api/beneficiaries/{id}`
- `GET /api/beneficiaries/banks` — bank list
- `POST /api/beneficiaries/resolve` — Monnify Verify Bank Account (falls
  back to Paystack, then a dev stub, so local development never breaks)

**Account + transactions**
- `GET /api/account` — balance
- `GET /api/transactions/` — history, filterable
- `POST /api/transactions/log` — manual entry
- `PATCH /api/transactions/{id}` — re-categorise

**Goals**
- `GET /api/goals`
- `POST /api/actions/goal` — create, with computed monthly pace
- `PATCH /api/actions/goals/{id}`
- `POST /api/actions/goals/{id}/deposit`
- `POST /api/actions/goals/{id}/withdraw`
- `DELETE /api/actions/goals/{id}`

**Money movement**
- `POST /api/actions/transfer` — PIN-verified, calls Monnify Single Transfer

**Insights**
- `GET /api/insights/` — runway, category breakdown, recurring charges,
  anomalies, goal risk

**Conversation**
- `POST /api/conversation/text` / `POST /api/conversation/audio`
- `GET /api/conversation/history`

**Webhooks**
- `POST /api/webhooks/monnify` — signature-verified inbound payment
  notifications

**Settings**
- `PATCH /api/settings/profile`
- `PATCH /api/settings/change-pin`
- `DELETE /api/settings/account`

## 5. Monnify integration

| Zuri feature | Monnify endpoint | When called |
|---|---|---|
| Signup: create receiving account | Reserved Account (create) | On `/api/auth/signup` |
| Balance / transaction reads | Wallet Balance | On demand |
| Add beneficiary safely | Verify Bank Account | `POST /beneficiaries/resolve` |
| "Send ₦X to Mummy" | Single Transfer | `POST /actions/transfer` after PIN verified |
| Every real-time reaction | Webhooks | `/api/webhooks/monnify` |
| Verify webhook is genuine | Signature validation (HMAC-SHA512) | First step of webhook handler |

**Auth flow with Monnify**: Base64-encode `apiKey:secretKey`, call the
Monnify login endpoint for a bearer token (valid ~1 hour), cached in memory
and refreshed on 401.

**Demo-mode fallback**: with no Monnify credentials configured, the service
degrades gracefully — signup, resolution, and the rest of the app still
work end-to-end (using self-reported data and a dev-stub name resolver), so
local development and rehearsal never depend on sandbox uptime. Real
credentials switch it on.

**Idempotency**: every outbound transfer carries a generated reference,
stored before the Monnify call; retries reuse it and never double-charge.
Every webhook is matched and deduped on Monnify's own reference.

## 6. AI layer

- **Speech-to-text**: OpenAI Whisper. Live captions appear via the browser's
  speech API while the user talks; the accurate transcript replaces it once
  they stop.
- **LLM reasoning**: OpenAI, tool-calling / structured output only — never
  free text into money movement. System prompt anchors: always confirm
  before executing, never invent account numbers, only reference
  beneficiaries/goals actually in the user's data, ground advice in real
  computed numbers.
- **Text-to-speech**: OpenAI TTS, replying in the same language the user
  used.
- **Insights are computed, not guessed**: `insights_service.py` is a
  deterministic engine — runway, burn rate, category breakdown, recurring
  charges, anomalies, goal risk. The AI quotes these numbers verbatim.

## 7. Security & authorization

- 4-digit PIN, bcrypt-hashed, never logged, never sent to the LLM, never
  stored in plaintext.
- Account password hashed separately from the PIN.
- JWT access tokens; unverified/dev-mode tokens only accepted outside
  `NODE_ENV=production`.
- Every money movement requires PIN confirmation — no exceptions.
- Voice can only initiate transfers to already-saved, verified
  beneficiaries.
- Low STT or LLM confidence → Zuri asks the user to confirm rather than
  guessing.
- Webhook signature verification is the first line of the handler; anything
  unverified is rejected.
- CORS restricted to configured frontend origins.

## 8. Frontend screens

1. **Landing / Onboarding** — language pick, PIN setup, starting balance +
   income + recurring expenses
2. **Home** — balance, conversation feed (voice + text bubbles), mic button,
   Zuri's proactive messages
3. **Goals** — active goals with progress, create/deposit/withdraw
4. **History** — transaction list with AI-assigned category chips,
   re-categorise on tap
5. **Settings** — language, PIN change, delete account

## 9. Environment variables

```
# Server
PORT=8000
NODE_ENV=production

# Auth
JWT_SECRET=

# AI
OPENAI_API_KEY=

# Monnify
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_WALLET_ACCOUNT_NUMBER=
MONNIFY_BASE_URL=https://sandbox.monnify.com

# CORS
ALLOWED_ORIGINS=
```

See [`README.md`](README.md) for setup instructions and
[`DEPLOY_DEMO.md`](DEPLOY_DEMO.md) / [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for
running and recording the demo.
