# Zuri — Deploy & Demo Runbook (for the PM)

This guide gets Zuri **live and demo-ready**: backend on **Render**, frontend on
**Vercel**, real **Monnify Sandbox** rails, no OTP-copy-paste during the
presentation.

> Goal: the PM opens one URL, signs up, and can show **send money**, **auto-save
> savings goal**, and **money landing** — with Zuri's voice AI.

---

## 1. Deploy the backend (Render)

1. Push this repo to GitHub (or connect the folder).
2. In **Render** → **New → Web Service** → pick the repo, **Root directory = `backend`**.
   - Or use the `backend/render.yaml` blueprint (Render detects it).
3. Settings that matter:
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health check:** `/health` (Render shows "Live")
   - **Plan:** free is fine; a **paid instance** gives a **static outbound IP**
     (needed for the Monnify IP whitelist — see §3).
4. Set **Environment Variables** (Render dashboard → Environment):
   ```
   JWT_SECRET             = <long random string>
   MONNIFY_BASE_URL       = https://sandbox.monnify.com
   MONNIFY_API_KEY        = MK_TEST_...
   MONNIFY_SECRET_KEY     = ...
   MONNIFY_CONTRACT_CODE  = 6220333772
   MONNIFY_WALLET_ACCOUNT_NUMBER = 8876643948
   ALLOWED_ORIGINS        = https://<your-app>.vercel.app
   OPENAI_API_KEY         = <optional, for AI chat>
   # Set FORCE_DEMO=1 to run a bulletproof simulated demo (no OTP, no network)
   # even when real keys are present. Keep it OFF to hit the live sandbox.
   FORCE_DEMO             = 1
   # Welcome bonus (kobo) credited to EVERY new signup — this funds the
   # money-send demo right after the PM creates her account. Default ₦200,000.
   WELCOME_BONUS_KOBO     = 20000000
   ```
5. Note the URL: `https://zuri-backend.onrender.com`.

> ⚠️ **Data note:** free Render uses an ephemeral disk — the SQLite DB resets on
> redeploy. Fine for a demo. For persistence, add a Render **Disk** and set
> `DATABASE_PATH=/var/data/zuri.db`.

---

## 2. Deploy the frontend (Vercel)

1. In **Vercel** → **New Project** → import the repo.
2. **Root directory:** `frontend`.
3. Set a **build env var** (Vercel → Project → Settings → Environment Variables):
   ```
   VITE_API_URL = https://zuri-backend.onrender.com
   ```
4. Framework preset picks Vite automatically. The included `vercel.json` ensures
   `/dashboard/*` routes work (SPA rewrite).
5. Deploy → you get `https://<your-app>.vercel.app`.

> If you add the Vercel domain later, add it to the backend's
> `ALLOWED_ORIGINS` env and redeploy the backend.

---

## 3. Monnify: disable OTP + whitelist IP (so transfers complete on stage)

Transfers currently need a Monnify **OTP** (MFA) sent to your Monnify email.
To avoid the PM reading codes mid-demo, request a **Payout OTP waiver** and
**whitelist the server IP**.

> Send this **from the email address registered on your Monnify account**
> (the business owner must request it). Include the **outbound IP** of your
> Render service (paid plan → console/`curl ifconfig.me` from the service, or
> Render's static outbound IP).

**Email to `support@monnify.com`**

> **Subject:** Request for Payout OTP Waiver — <Your Business Name>
>
> Hello Monnify Support Team,
>
> We are integrating the Monnify Disbursement API and request a waiver for the
> Payout OTP requirement on our account.
>
> 1. **Registered Business Name:** <Your Business Name>
> 2. **Contract Code:** 6220333772
> 3. **Whitelisted IP Address:** <Render Server Outbound IP>
>
> We confirm we have implemented server-side IP whitelisting.
>
> Best regards,
> <Your Name>

Once approved, Monnify returns `SUCCESS` on transfer and Zuri completes it
immediately — **no OTP entry needed**. (If not yet approved, the app shows a
"pending authorization" state and the PM can still show the initiate step.)

---

## 4. Point Monnify webhooks at Zuri

Monnify Dashboard → **Developers → Webhook URLs**:

- **Transaction Completion / Account:** `https://zuri-backend.onrender.com/api/webhooks/monnify`

This makes **money-landing** work: when a reserved account is funded (via the
Monnify payment simulator), Zuri credits the user's wallet automatically.

> Locally, use an `ngrok http 4000` tunnel to get a public URL for the webhook.

---

## 5. Demo script (what the PM does on stage)

| # | Action | Result to show |
|---|--------|----------------|
| 1 | Open `https://<your-app>.vercel.app` | Zuri landing page |
| 2 | Sign up (phone + name + PIN) | Instant **reserved account number** (Wema/Sterling virtual account) + **₦200,000 welcome bonus** auto-credited (money to send with) |
| 3 | Say/type "send 500 to my saved contact" | Name Inquiry verifies, PIN prompt, transfer **completes** (no OTP thanks to waiver) |
| 4 | "Create a savings goal", then **auto-save** | Direct-debit mandate set up; goal balance grows |
| 5 | Fund the reserved account via the **Monnify payment simulator** | Wallet **auto-credits** via webhook |

> Fallback if a live call is slow: set `FORCE_DEMO=1` and the app runs a
> deterministic simulation (send money + auto-save complete instantly, no OTP).
> Every new signup is funded with `WELCOME_BONUS_KOBO` (default ₦200,000), and
> the balance card has a **"Top up ₦350k (demo)"** button as a backup funder.

---

## 6. Day-of checklist

- [ ] Backend shows **LIVE** on Render; `/health` returns ok
- [ ] Frontend loads at the Vercel URL
- [ ] `VITE_API_URL` set and rebuilt (CORS origin matches `ALLOWED_ORIGINS`)
- [ ] Monnify OTP waiver + IP whitelist confirmed (test one transfer)
- [ ] Webhook URL saved in Monnify dashboard
- [ ] Working server + the PM's signup gets `WELCOME_BONUS_KOBO` (or use the balance-card Top-up)
- [ ] Offline `zuri.db` snapshot or disk configured so data survives redeploys

---

## Useful endpoints (Swagger)

Interactive API docs: `https://zuri-backend.onrender.com/docs`
