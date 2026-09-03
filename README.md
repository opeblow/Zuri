<p align="center">
  <img src="assets/zuri-logo.svg" width="120" alt="Zuri logo" />
</p>

<h1 align="center">Zuri — Your money, out loud.</h1>

<p align="center">
  A conversational money app built for the <strong>APIConf Hackathon</strong>.<br/>
  Ask in English, Pidgin, Yoruba, Igbo or Hausa. Zuri thinks, confirms, and moves
  your money — every transfer PIN-protected and idempotent.
</p>

<p align="center">
  <a href="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white"><img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI"/></a>
  <a href="https://img.shields.io/badge/Python%203.12-3776AB?style=flat-square&logo=python&logoColor=white"><img src="https://img.shields.io/badge/Python%203.12-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.12"/></a>
  <a href="https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black"><img src="https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19"/></a>
  <a href="https://img.shields.io/badge/Vite%206-646CFF?style=flat-square&logo=vite&logoColor=white"><img src="https://img.shields.io/badge/Vite%206-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite 6"/></a>
  <a href="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white"><img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite"/></a>
  <a href="https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white"><img src="https://img.shields.io/badge/JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" alt="JWT"/></a>
  <a href="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs welcome"/></a>
</p>

---

## Features

- **Voice-first banking** — type or talk; Zuri replies in speech and text.
- **Multi-language** — English, Pidgin, Yoruba, Igbo, Hausa.
- **Money movements** — send money, pay bills, buy airtime & data, with bank account verification.
- **Savings goals** — create goals by voice, auto-deposit, track progress.
- **Beneficiaries** — nickname + verified account; transfers only go to saved people.
- **Smart history** — every transaction categorised (income, transfers, bills, lifestyle, shopping).
- **PIN-secured** — 4-digit PIN hashed with bcrypt; required before any transfer.
- **Demo money** — no pre-seeded data; you sign up fresh, and every new account gets a
  welcome bonus (or a "Top up" button) so transfers can be demoed instantly.

## Tech stack

| Layer      | Choice                                    |
| ---------- | ----------------------------------------- |
| Frontend   | React 19, Vite 6, React Router 7          |
| Backend    | Python 3.12, FastAPI, SQLite, Uvicorn     |
| Auth       | JWT (python-jose), bcrypt / passlib       |
| Payments   | Monnify (reserved accounts, transfers, direct-debit mandates, webhooks) |
| AI         | OpenAI (chat + speech-to-text)            |

## Project structure

```
zuri/
├── assets/
│   └── zuri-logo.svg              # brand mark
├── backend/                       # API service
│   ├── .env.example               # environment template
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # app assembly, CORS, DB init on boot
│       ├── database.py            # SQLite schema + migrations
│       ├── schemas.py             # Pydantic request/response models
│       ├── routers/
│       │   ├── auth.py            # signup, login, verify-pin, JWT guard
│       │   ├── account.py         # balance, banks, demo events
│       │   ├── beneficiaries.py   # saved beneficiaries + Paystack resolve
│       │   ├── conversation.py    # chat + voice (text/audio)
│       │   ├── goals.py           # savings goal lifecycle
│       │   ├── settings.py        # profile, PIN change, delete account
│       │   └── transactions.py    # history, transfer, re-categorise
│       └── services/
│           ├── ai_service.py      # chat + speech-to-text
│           └── auth_service.py    # bcrypt PIN + JWT helpers
└── frontend/                      # React app
    ├── vite.config.js             # /api proxy -> backend :4000
    └── src/
        ├── App.jsx / main.jsx
        ├── styles.css + styles/   # landing, dashboard
        ├── lib/api.js             # typed API client + SSE streaming
        ├── state/AuthContext.jsx
        ├── screens/               # Landing, Welcome, Onboarding, Home,
        │                          # Goals, Beneficiaries, History, Settings
        └── components/            # Shell, PinModal, SendMoneyModal,
                                   # PayBillsModal, AirtimeDataModal, ...
```

## Getting started

### Prerequisites

- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env    # Windows · macOS/Linux: cp .env.example .env
uvicorn app.main:app --reload --port 4000
```

The SQLite DB (`backend/zuri.db`) is created automatically on first boot (tables +
migrations only — no seed data) — no migration step needed.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` to the backend.

All amounts are stored in **kobo** (₦1 = 100 kobo); the UI renders naira.

## Environment variables

| Variable              | Required | Description                              |
| --------------------- | -------- | ---------------------------------------- |
| `PORT`                | no       | API port (default `8000`)                |
| `NODE_ENV`            | no       | `development` accepts dev-mode tokens    |
| `JWT_SECRET`          | yes      | Secret used to sign access tokens        |
| `OPENAI_API_KEY`      | no       | Chat + speech-to-text (blank = fallback) |
| `PAYSTACK_SECRET_KEY` | no       | Transfers + bank account resolution      |
| `PAYSTACK_PUBLIC_KEY` | no       | Paystack public key (frontend checkout)  |
| `MONNIFY_API_KEY`     | no*      | Monnify API key (sandbox/live)           |
| `MONNIFY_SECRET_KEY`  | no*      | Monnify secret key (sandbox/live)        |
| `MONNIFY_CONTRACT_CODE` | no*    | Monnify contract code for reserved accounts & mandates |
| `MONNIFY_BASE_URL`    | no*      | `https://sandbox.monnify.com` by default |
| `MONNIFY_WALLET_ACCOUNT_NUMBER` | no* | Disbursement wallet account (Dashboard > Disbursement) |

\* Without `MONNIFY_*` keys the app runs in **demo mode** (simulated money
movement) — perfect for a no-keys bootstrap. Provide real values to use the
Monnify rails.

## Monnify integration & webhooks

Zuri already wires the real Monnify Sandbox APIs:

- **Reserved account on signup** — every new user gets a virtual account number.
- **Name Inquiry** — beneficiary accounts verified via Monnify before transfer.
- **Transfers** — idempotent, PIN-gated, OTP-authorised (MFA is on by default).
- **Direct-debit mandates** — set up recurring savings on a goal, then auto-save.
- **Webhooks** — incoming reserved-account payments auto-credit a user's wallet.

### Webhook URL (Monnify dashboard)

Set the **transaction completion / account** webhook URL in your Monnify
Dashboard (Developers → Webhook URLs) to:

```
https://<your-public-host>/api/webhooks/monnify
```

It is verified with HMAC-SHA512 via the `monnify-signature` header. **Note:**
sandbox webhooks omit the signature header and Monnify's production webhook IP
is `35.242.133.146` — whitelist it in production.

### Receiving webhooks locally (tunnel)

Monnify can't reach `localhost`, so expose the backend with a tunnel:

```bash
ngrok http 4000
# → https://<random>.ngrok.io/api/webhooks/monnify  (use this as the webhook URL)
```

Keep `uvicorn app.main:app --port 4000` running; the tunnel forwards Monnify's
POST to your machine.

### Testing money-in (sandbox)

Real banks/apps (e.g. Opay) **cannot** fund Monnify sandbox virtual accounts —
that's expected (they're gateway-provisioned). Use the
[Monnify payment simulator](https://websim.sdk.monnify.com/?#/bankingapp) to
deposit into a reserved account, which triggers the webhook and credits the
user's wallet. Alternatively use `POST /api/demo/salary-landed` for a local
credit during a walkthrough.


## API overview

| Method | Endpoint                             | Description                      |
| ------ | ------------------------------------ | -------------------------------- |
| POST   | `/api/auth/signup`                   | Register with phone + PIN         |
| POST   | `/api/auth/login`                    | Login with phone + PIN → JWT      |
| POST   | `/api/auth/verify-pin`               | Validate a PIN before a transfer  |
| GET    | `/api/account`                       | Balance + reserved account        |
| GET    | `/api/transactions`                  | Categorised transaction history   |
| POST   | `/api/transactions/transfer`         | Idempotent, PIN-gated transfer    |
| POST   | `/api/transactions/transfer/authorize` | Complete a transfer with the Monnify OTP |
| GET    | `/api/beneficiaries`                 | Saved beneficiaries               |
| POST   | `/api/beneficiaries/resolve`         | Verify account number (Monnify Name Inquiry) |
| GET    | `/api/beneficiaries/banks`           | List Nigerian banks               |
| GET    | `/api/goals`                         | Savings goals                     |
| POST   | `/api/actions/goal`                  | Create a goal                     |
| POST   | `/api/actions/goals/{id}/deposit`    | Deposit into a goal               |
| POST   | `/api/actions/goals/{id}/withdraw`   | Withdraw from a goal              |
| POST   | `/api/actions/goals/{id}/mandate`    | Set up a direct-debit auto-save mandate |
| POST   | `/api/actions/goals/{id}/auto-save`  | Trigger a recurring auto-save debit |
| POST   | `/api/webhooks/monnify`              | Monnify webhook (top-ups credit wallet) |
| POST   | `/api/conversation/text`             | Chat with Zuri (text)             |
| POST   | `/api/conversation/audio`            | Chat with Zuri (voice)            |
| PATCH  | `/api/settings/profile`              | Update language / biometric prefs |
| POST   | `/api/demo/salary-landed`            | Demo webhook: salary credits      |
| POST   | `/api/demo/reset`                    | Reset demo data                   |

Interactive docs: **http://localhost:4000/docs** (Swagger UI).

## Security

- 4-digit PIN hashed with **bcrypt** — never logged, never sent to the AI model.
- **JWT** access tokens; dev mode never enabled in production.
- Transfers require a **verified PIN** and use an **idempotency key** to prevent double-charges.
- Money only moves to **saved, bank-verified beneficiaries**.
- CORS restricted to the frontend origins.

## Roadmap

- [x] Wire Monnify reserved accounts + webhooks (real rails)
- [x] Direct-debit mandates on goals
- [ ] Proactive notifications when salary lands
- [ ] Automated savings rules (round-ups, % of income)
- [ ] Bills payment (airtime/data/electricity/cable — needs Monnify Bills activation)

## Contributing

PRs are welcome. Open an issue first to discuss your idea, then:

1. Fork the repo and create a branch: `git checkout -b feature/your-idea`
2. Make your changes and verify backend + frontend boot
3. Push and open a pull request

## License

Released for the **APIConf Hackathon**. See the project brief (`Zuri_Developer_Brief.docx`) for context.