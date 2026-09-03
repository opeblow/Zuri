# Zuri — Demo Recording Guide

Zuri is a **self-reported money diary**, not a bank integration — there is no
Monnify/Paystack rail to configure and nothing to whitelist. That means the
demo is just: run two local servers, sign up, talk to it.

---

## 1. Run it

```bash
# one-time setup
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
cp backend/.env.example backend/.env   # then paste your OPENAI_API_KEY in

# every time
npm run dev
```

This starts the FastAPI backend on **:4000** and the Vite dev server on
**:5173** together (`npm run dev:backend` / `npm run dev:frontend` if you'd
rather run them in separate terminals). Open **http://localhost:5173**.

Without `OPENAI_API_KEY` set, the chat/voice screens will error when Zuri
tries to reply — set the key before recording.

## 2. Microphone check (do this before hitting record)

Zuri's voice loop needs a **real mic input**, not your laptop's default if
that's a bad one:

- Use a headset or external mic if you have one — built-in laptop mics pick
  up keyboard/fan noise that hurts Whisper's transcription accuracy.
- Record somewhere quiet. The browser's noise suppression/echo cancellation
  is on, but it can't fix a noisy room.
- When you tap the mic and start talking, a live caption appears in the chat
  immediately (browser speech-to-text) so you can *see* Zuri is hearing you;
  the accurate transcript (via OpenAI Whisper) replaces it once you stop
  talking and Zuri finishes processing.
- Speak at a normal pace and pause briefly before tapping stop — clipping the
  last word is the most common cause of a bad transcription.

## 3. Suggested demo script

| # | Action | What it shows |
|---|--------|----------------|
| 1 | Open the landing page, click through to sign up | Language picker (English/Pidgin/Yoruba/Igbo/Hausa), 4-digit PIN |
| 2 | Onboarding: enter a starting balance, monthly income, one or two recurring expenses (e.g. "Rent" ₦150,000, "Netflix" ₦3,900) | Zuri backdates a bit of history so insights aren't empty on day one |
| 3 | On the dashboard, point out **Spend intelligence** (runway, this week vs last week, category breakdown) | "computed, not guessed" — real numbers from real entries, not an LLM estimate |
| 4 | Tap the mic and say something like *"I just spent five thousand naira on fuel"* | Live caption appears while you talk; Zuri transcribes, logs the expense, updates your balance, and speaks/writes a reply — all visible in the chat feed |
| 5 | Ask (typed or spoken): *"How is my spending looking this month?"* | Zuri quotes the exact computed figures (burn rate, runway, top categories) |
| 6 | Say *"Help me save 600k for rent by December"* | Zuri creates a savings goal with a computed monthly pace via `create_goal` |
| 7 | Refresh the page | Conversation history persists — the chat isn't reset, because messages are stored server-side |

## 4. If something looks off right before recording

- **Insights look empty right after onboarding** — that's expected if you
  onboarded with only a starting balance and no recurring expenses; the
  category breakdown and burn rate need at least a couple of logged entries
  to say something interesting. Log 1–2 sample expenses first.
- **Voice reply has no audio** — `OPENAI_API_KEY` missing/invalid, or TTS
  quietly failed; the reply still renders as text either way, so the demo
  isn't blocked, just silent. Check the backend terminal for errors.
- **Mic button does nothing** — the browser needs mic permission; Chrome/Edge
  work best for both `MediaRecorder` and the live-caption speech API.

## 5. Deploying instead of running locally

Optional — a live URL isn't required to record a demo, but if you want one:

- **Backend** → Render (`backend/render.yaml` blueprint). Set `JWT_SECRET`
  and `OPENAI_API_KEY` in the dashboard. Free tier's disk is ephemeral, so the
  SQLite DB resets on redeploy — fine for a demo, not for persistence.
- **Frontend** → Vercel, root directory `frontend`, build env
  `VITE_API_URL=https://<your-backend>.onrender.com`. `frontend/vercel.json`
  already rewrites `/dashboard/*` for the SPA.
- Add the Vercel URL to the backend's `ALLOWED_ORIGINS` env var.

Interactive API docs while developing: **http://localhost:4000/docs**.
