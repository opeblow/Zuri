# Zuri — Your money, out loud.

Conversational money app for the **APIConf Hackathon** (Monnify APIs).  
Stack for this build: **Vite + React** (mobile-first web) · **Node/Express** · in-memory demo store (swap-ready for Postgres/Redis).

---

## How it works (end to end)

Zuri has five parts that mirror the brief:

| Brain | Job |
|-------|-----|
| **Ear** | Browser mic (Web Speech API) or typed text → transcript |
| **Mind** | LLM / demo reasoner turns transcript + live money memory into **structured JSON** (never free-text transfers) |
| **Voice** | ElevenLabs when keyed, otherwise browser `speechSynthesis` |
| **Memory** | Balance, beneficiaries, goals, 3-month seeded history → refreshed on Monnify webhooks |
| **Rail** | Monnify reserved accounts, verify bank, transfers, direct debit, webhooks (demo mode simulates them) |

### One command, followed through

Example: *"Send ₦5,000 to Mummy"*

1. **Home** sends `POST /conversation/text` with the transcript.
2. Backend loads **memory snapshot** (balance, Mummy as beneficiary, usual send size, goals).
3. **Mind** returns Zod-validated JSON: `{ action: "transfer", amount_kobo: 500000, recipient_ref: "Mummy", pending_action, reply_text }`.
4. Zuri **speaks** the confirmation (full name + amount).
5. UI opens the **PIN modal** (non-negotiable).
6. `POST /actions/transfer` verifies PIN → writes idempotent `paymentReference` → Monnify single transfer → debit balance → settle txn.
7. Zuri speaks: *"Money has landed with Mummy…"*

### The three killer demo moments

1. **Rent** — ask how to pay ₦900k rent in November → plan from salary rhythm → PIN → direct-debit mandate on the rent goal.
2. **Salary landed** — tap **Fire salary** on Home → webhook path credits ₦450k → proactive Zuri message listing committed rent / Mum / tax / free cash.
3. **Yoruba** — paste/speak `Ṣé mo ní owó tí mo lè fi rá phone tuntun báyìí?` → Yoruba advice grounded in rent goal + balance.

---

## Quick start

```bash
cd backend && copy .env.example .env && npm install && npm run dev
# new terminal
cd frontend && npm install && npm run dev
```

- App: http://localhost:5173  
- API: http://localhost:4000  
- **Demo login:** phone `08012345678` · PIN `1234` (or tap **Enter demo (Amina)**)

`DEMO_MODE=true` (default) needs **no** Monnify/OpenAI/ElevenLabs keys.  
Set keys in `backend/.env` and `DEMO_MODE=false` to hit real APIs.

---

## Repo layout

```
zuri/
  backend/src/
    db/store.js          # schema-shaped in-memory DB
    db/seed.js           # Amina + 3 months of history
    services/monnify.js  # rail (+ demo stubs)
    services/memory.js   # LLM context builder
    services/ai.js       # STT / LLM / TTS + demo reasoner
    routes/*             # auth, beneficiaries, account, conversation, actions, webhooks
  frontend/src/
    screens/             # Welcome, Onboarding, Home, Goals, People, Activity, Settings
    components/          # Shell, PinModal
```

---

## Security (shipped as designed)

- PIN bcrypt-hashed; never logged; never sent to the LLM  
- Voice can only transfer to **saved beneficiaries**  
- First-send cap ₦20k; &gt;3× usual amount → extra confirmation copy  
- Webhook HMAC checked first (`DEMO` signature allowed only in demo mode)  
- Idempotent transfer references; rate limits on conversation + actions  

---

## Screens

1. Onboarding — name/phone/language/PIN → reserved account reveal  
2. Home — balance pill + chat feed + mic (not a dashboard)  
3. Goals — progress (create via voice)  
4. People — nickname + bank verify  
5. Activity — categorized transactions  
6. Settings — language prefs, reset demo, logout  
