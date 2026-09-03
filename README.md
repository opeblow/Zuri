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

## ✨ Features

- **Voice-first banking** — type or talk; Zuri replies in speech and text.
- **Multi-language** — English, Pidgin, Yoruba, Igbo, Hausa.
- **Money movements** — send money, pay bills, buy airtime & data, with bank account verification.
- **Savings goals** — create goals by voice, auto-deposit, track progress.
- **Beneficiaries** — nickname + verified account; transfers only go to saved people.
- **Smart history** — every transaction categorised (income, transfers, bills, lifestyle, shopping).
- **PIN-secured** — 4-digit PIN hashed with bcrypt; required before any transfer.
- **Demo mode** — pre-seeded demo account, no real keys required to explore.

## 🧱 Tech stack

| Layer      | Choice                                    |
| ---------- | ----------------------------------------- |
| Frontend   | React 19, Vite 6, React Router 7          |
| Backend    | Python 3.12, FastAPI, SQLite, Uvicorn     |
| Auth       | JWT (python-jose), bcrypt / passlib       |
| Payments   | Paystack (transfers, account resolve)     |
| AI         | OpenAI (chat + speech-to-text)            |

## 📁 Project structure

```
zuri/
├── assets/
│   └── zuri-logo.svg              # brand mark
├── backend/                       # API service
│   ├── .env.example               # environment template
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # app assembly, CORS, DB init + seed on boot
│       ├── database.py            # SQLite schema + demo seed (Amina)
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

## 🚀 Getting started

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

The SQLite DB (`backend/zuri.db`) is created and seeded automatically on first
boot — no migration step needed.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` to the backend.

### Demo account

> **Phone:** `08012345678` · **PIN:** `1234`
> — or tap **Enter demo** on the Welcome screen.

All amounts are stored in **kobo** (₦1 = 100 kobo); the UI renders naira.

## 🔑 Environment variables

| Variable              | Required | Description                              |
| --------------------- | -------- | ---------------------------------------- |
| `PORT`                | no       | API port (default `8000`)                |
| `NODE_ENV`            | no       | `development` accepts dev-mode tokens    |
| `JWT_SECRET`          | yes      | Secret used to sign access tokens        |
| `OPENAI_API_KEY`      | no       | Chat + speech-to-text (blank = fallback) |
| `PAYSTACK_SECRET_KEY` | no       | Transfers + bank account resolution      |
| `PAYSTACK_PUBLIC_KEY` | no       | Paystack public key (frontend checkout)  |

## 📡 API overview

| Method | Endpoint                             | Description                      |
| ------ | ------------------------------------ | -------------------------------- |
| POST   | `/api/auth/signup`                   | Register with phone + PIN         |
| POST   | `/api/auth/login`                    | Login with phone + PIN → JWT      |
| POST   | `/api/auth/verify-pin`               | Validate a PIN before a transfer  |
| GET    | `/api/account`                       | Balance + reserved account        |
| GET    | `/api/transactions`                  | Categorised transaction history   |
| POST   | `/api/transactions/transfer`         | Idempotent, PIN-gated transfer    |
| GET    | `/api/beneficiaries`                 | Saved beneficiaries               |
| POST   | `/api/beneficiaries/resolve`         | Verify account number (Paystack)  |
| GET    | `/api/beneficiaries/banks`           | List Nigerian banks               |
| GET    | `/api/goals`                         | Savings goals                     |
| POST   | `/api/actions/goal`                  | Create a goal                     |
| POST   | `/api/actions/goals/{id}/deposit`    | Deposit into a goal               |
| POST   | `/api/actions/goals/{id}/withdraw`   | Withdraw from a goal              |
| POST   | `/api/conversation/text`             | Chat with Zuri (text)             |
| POST   | `/api/conversation/audio`            | Chat with Zuri (voice)            |
| PATCH  | `/api/settings/profile`              | Update language / biometric prefs |
| POST   | `/api/demo/salary-landed`            | Demo webhook: salary credits      |
| POST   | `/api/demo/reset`                    | Reset demo data                   |

Interactive docs: **http://localhost:4000/docs** (Swagger UI).

## 🔒 Security

- 4-digit PIN hashed with **bcrypt** — never logged, never sent to the AI model.
- **JWT** access tokens; dev mode never enabled in production.
- Transfers require a **verified PIN** and use an **idempotency key** to prevent double-charges.
- Money only moves to **saved, bank-verified beneficiaries**.
- CORS restricted to the frontend origins.

## 🛣️ Roadmap

- [ ] Wire Monnify reserved accounts + webhooks (real rails)
- [ ] Direct-debit mandates on goals
- [ ] Proactive notifications when salary lands
- [ ] Automated savings rules (round-ups, % of income)

## 🤝 Contributing

PRs are welcome. Open an issue first to discuss your idea, then:

1. Fork the repo and create a branch: `git checkout -b feature/your-idea`
2. Make your changes and verify backend + frontend boot
3. Push and open a pull request

## 📝 License

Released for the **APIConf Hackathon**. See the project brief (`Zuri_Developer_Brief.docx`) for context.