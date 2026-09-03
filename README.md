<p align="center">
  <img src="assets/zuri-logo.svg" width="120" alt="Zuri logo" />
</p>

<h1 align="center">Zuri — Your money, out loud.</h1>

<p align="center">
  An AI money diary built for the <strong>APIConf Hackathon</strong>.<br/>
  Tell Zuri what you earned or spent — by voice or text, in English, Pidgin, Yoruba,
  Igbo or Hausa — and it narrates your money back to you: what changed, what's
  recurring, what's odd, and how many days your balance actually covers.
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

## Why a diary, not a bank connection

Zuri doesn't touch a real bank account and never asks for banking
credentials. You tell it what came in or went out — by typing, or just
saying it out loud — and that log is the entire source of truth. No OAuth
consent screen, no OTP, nothing to sync or hack. In exchange for a little
self-reporting, the app can run entirely on real numbers you control, with
no external payment rails to keep alive for a demo.

## Features

- **Spend intelligence, computed not guessed** — a deterministic engine
  (`insights_service.py`) turns logged entries into runway/burn-rate,
  week-over-week and month-over-month trend, category breakdown,
  recurring-charge detection, spending anomalies, and goal-vs-reality risk
  flags. The AI quotes these numbers verbatim — it never invents them.
- **Real voice loop** — tap the mic and talk. A live caption shows what
  Zuri's hearing while you speak (browser speech recognition), the audio is
  transcribed accurately with Whisper once you stop, and the reply is
  spoken back via OpenAI TTS. Typed questions get spoken replies too.
- **An agent that takes action** — mention any amount you earned or spent in
  plain language ("just got paid 200k", "spent 3k on fuel") and Zuri logs it
  immediately via a tool call, then confirms with your new balance. Ask it to
  set up a savings goal and it computes a monthly pace for you.
- **Multi-language** — English, Pidgin, Yoruba, Igbo, Hausa.
- **Conversation history persists** — every exchange is stored server-side,
  so refreshing the page doesn't lose the chat.
- **Savings goals** — create goals by voice or form, deposit/withdraw,
  track progress, with goal-at-risk warnings when commitments outpace what's
  actually disposable.
- **Onboarding that seeds real history** — new users enter a starting
  balance, rough monthly income, and 1–2 recurring expenses; Zuri backdates
  a bit of transaction history so insights have something to say from day one.
- **PIN-secured** — 4-digit PIN hashed with bcrypt, separate from the
  account password.

## Tech stack

| Layer      | Choice                                    |
| ---------- | ----------------------------------------- |
| Frontend   | React 19, Vite 6, React Router 7          |
| Backend    | Python 3.12, FastAPI, SQLite, Uvicorn     |
| Auth       | JWT (python-jose), bcrypt / passlib       |
| AI         | OpenAI (chat + tool-calling, Whisper speech-to-text, TTS) |

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
│       │   ├── account.py         # balance, demo reset
│       │   ├── onboarding.py      # seeds starting balance + history
│       │   ├── conversation.py    # chat + voice (text/audio), history
│       │   ├── goals.py           # savings goal lifecycle
│       │   ├── insights.py        # computed spend-intelligence endpoint
│       │   ├── settings.py        # profile, PIN change, delete account
│       │   └── transactions.py    # history, manual log, re-categorise
│       └── services/
│           ├── ai_service.py      # chat agent, tool-calling, speech I/O
│           ├── insights_service.py # deterministic insights engine
│           ├── ledger_service.py  # balance + transaction bookkeeping
│           └── auth_service.py    # bcrypt PIN + JWT helpers
└── frontend/                      # React app
    ├── vite.config.js             # /api proxy -> backend :4000
    └── src/
        ├── App.jsx / main.jsx
        ├── styles.css + styles/   # landing, onboarding, dashboard
        ├── lib/api.js             # typed API client
        ├── state/AuthContext.jsx
        ├── screens/               # Landing, Onboarding, Home, Goals,
        │                          # History, Settings
        └── components/            # Shell, PinModal, Reveal
```

## Getting started

### Prerequisites

- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/)

### Quick start (both servers together)

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
cp backend/.env.example backend/.env    # then set OPENAI_API_KEY
npm install                             # installs the root dev-runner
npm run dev
```

Open **http://localhost:5173** — the Vite dev server proxies `/api` to the
backend on `:4000`. See [`DEPLOY_DEMO.md`](DEPLOY_DEMO.md) for a full demo
script and mic-quality tips before recording.

### Running the two servers separately

```bash
# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 4000

# Frontend
cd frontend
npm install
npm run dev
```

The SQLite DB (`backend/zuri.db`) is created automatically on first boot
(tables + migrations only — no seed data).

All amounts are stored in **kobo** (₦1 = 100 kobo); the UI renders naira.

## Environment variables

| Variable         | Required | Description                                    |
| ---------------- | -------- | ----------------------------------------------- |
| `PORT`           | no       | API port (default `8000`; the dev script uses `4000`) |
| `NODE_ENV`       | no       | `development` accepts dev-mode/unverified tokens |
| `JWT_SECRET`     | yes      | Secret used to sign access tokens               |
| `OPENAI_API_KEY` | no       | Chat agent, Whisper transcription, TTS — blank disables the AI features |
| `ALLOWED_ORIGINS`| no       | Comma-separated extra CORS origins (besides localhost:5173/3000) |

## API overview

| Method | Endpoint                             | Description                      |
| ------ | ------------------------------------ | -------------------------------- |
| POST   | `/api/auth/signup`                   | Register with phone + password + PIN |
| POST   | `/api/auth/login`                    | Login with phone + PIN → JWT      |
| POST   | `/api/auth/verify-pin`               | Validate a PIN                    |
| POST   | `/api/onboarding/setup`              | Seed starting balance + recurring history |
| GET    | `/api/account`                       | Balance                           |
| GET    | `/api/transactions/`                 | Logged transaction history        |
| POST   | `/api/transactions/log`              | Manually log income/expense       |
| PATCH  | `/api/transactions/{id}`             | Re-categorise a transaction       |
| GET    | `/api/goals`                         | Savings goals                     |
| POST   | `/api/actions/goal`                  | Create a goal                     |
| PATCH  | `/api/actions/goals/{id}`            | Update a goal                     |
| POST   | `/api/actions/goals/{id}/deposit`    | Deposit into a goal               |
| POST   | `/api/actions/goals/{id}/withdraw`   | Withdraw from a goal              |
| DELETE | `/api/actions/goals/{id}`            | Delete a goal                     |
| GET    | `/api/insights/`                     | Runway, category breakdown, recurring charges, anomalies, goal risk |
| GET    | `/api/conversation/history`          | Past chat messages                |
| POST   | `/api/conversation/text`             | Chat with Zuri (text)             |
| POST   | `/api/conversation/audio`            | Chat with Zuri (voice)            |
| PATCH  | `/api/settings/profile`              | Update language / biometric prefs |
| PATCH  | `/api/settings/change-pin`           | Change PIN                        |
| DELETE | `/api/settings/account`              | Delete account and all data       |
| POST   | `/api/demo/reset`                    | Reset demo data                   |

Interactive docs: **http://localhost:4000/docs** (Swagger UI).

## Security

- 4-digit PIN hashed with **bcrypt** — never logged, never sent to the AI model.
- Account password hashed separately from the PIN.
- **JWT** access tokens; unverified/dev-mode tokens only accepted outside `NODE_ENV=production`.
- CORS restricted to the frontend origins.

## Roadmap

- [x] Deterministic spend-intelligence engine (runway, anomalies, recurring charges, goal risk)
- [x] Full voice loop (live captions → Whisper STT → GPT tool-calling → OpenAI TTS)
- [x] Persistent conversation history
- [ ] Proactive notifications when a recurring charge or anomaly is detected
- [ ] Automated savings rules (round-ups, % of income)

## Contributing

PRs are welcome. Open an issue first to discuss your idea, then:

1. Fork the repo and create a branch: `git checkout -b feature/your-idea`
2. Make your changes and verify backend + frontend boot
3. Push and open a pull request

## License

Released for the **APIConf Hackathon**. See the project brief (`Zuri_Developer_Brief.docx`) for context.
