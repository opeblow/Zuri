# Zuri — 3-Minute Demo Script

Total runtime target: **2:50–3:00**. Timestamps assume a natural speaking
pace (~150 wpm) — rehearse once and trim pauses, not words, if you're running
long.

---

## 0:00–0:15 — Landing page

**Screen:** Landing page → click through to sign up.

> "This is Zuri — an AI money diary for Nigeria, powered by Monnify. You get
> a real bank account number on signup. Money lands automatically via Monnify
> webhooks. You talk to it by voice — in English, Pidgin, Yoruba, Igbo, or
> Hausa — and it narrates your money back to you."

---

## 0:15–0:40 — Signup + Monnify reserved account

**Screen:** Fill signup form → tap Sign up. Dashboard loads showing a real
account number under the balance.

> "Watch what happens on signup. I enter my details, and Zuri calls Monnify
> to provision a real reserved account number — right there on the dashboard.
> That's a real Wema Bank account number, funded via any bank app. No mock,
> no sandbox toggle — that's a live Monnify API call."

**Screen:** Point at the reserved account number and bank name on the balance
card.

---

## 0:40–1:10 — Dashboard: spend intelligence

**Screen:** Land on dashboard. Point at runway, this-week-vs-last-week,
category breakdown.

> "Here's the dashboard. Runway — how many days my balance actually covers.
> Week-over-week spend. Category breakdown. None of this is an AI guess —
> it's a deterministic engine computing real numbers from real entries,
> whether those entries come from my voice, a Monnify webhook, or both."

---

## 1:10–1:50 — Voice logging + real Monnify inflow

**Screen:** Tap the mic, speak: *"I just spent five thousand naira on
fuel."*

> "Now watch the voice loop. I tap the mic and just talk."

**[speak the line — live caption appears while talking]**

> "Zuri transcribes it, logs the expense as a tool call, updates my balance,
> and replies — out loud and in the chat. No forms, no menus."

**Screen:** Balance updates, chat shows Zuri's reply.

**[Simulate Monnify webhook — if live sandbox: have someone transfer ₦50,000
to the reserved account number. If demo mode: trigger the webhook via curl
or Postman.]**

> "Now here's the Monnify magic — someone just sent money to my reserved
> account. Zuri got the webhook from Monnify, verified the signature, and
> my balance updated automatically. I didn't have to type or say anything.
> That's real money movement, not a diary entry."

**Screen:** Balance jumps up, new transaction appears as "income" with
Monnify reference.

---

## 1:50–2:25 — Send money to a beneficiary

**Screen:** Navigate to Beneficiaries tab. Show the "Add beneficiary" flow:
select bank → enter account number → Monnify Name Inquiry verifies the real
account name → save as "Mummy".

> "Adding a beneficiary is verified end-to-end by Monnify. I enter an
> account number, Monnify confirms the real name, and I save it with a
> nickname."

**Screen:** Back on dashboard or Beneficiaries tab. Speak: *"Send five
thousand naira to Mummy."*

> "Now I can send money by voice. Zuri looks up Mummy from my verified
> beneficiaries, and asks for my PIN to confirm."

**Screen:** PIN modal appears → enter PIN → transfer fires via Monnify
Single Transfer API → confirmation shows reference and new balance.

> "That's a real Monnify Single Transfer — money moved from my reserved
> account to Mummy's real bank account. Reference, balance, done."

---

## 2:25–2:50 — Ask a question + savings goal

**Screen:** Type or speak: *"How is my spending looking this month?"*

> "I can also just ask it things."

**[send the message]**

> "It answers with the exact computed figures — burn rate, runway, top
> category — grounded in real Monnify-sourced transactions and self-reported
> entries."

**Screen:** Speak or type: *"Help me save 600k for rent by December."*

> "And I can set a savings goal by voice — Zuri works out a monthly pace
> automatically."

---

## 2:50–3:00 — Persistence + close

**Screen:** Refresh the page. Chat history and transactions are still there.

> "Refresh the page — nothing's lost. Chat, transactions, Monnify-sourced
> inflows — all stored server-side. That's Zuri: voice-native, Monnify-powered,
> real money movement, plain numbers."

**[end]**

---

## Timing cheat sheet

| Segment | Duration | Cumulative |
|---|---|---|
| Landing | 15s | 0:15 |
| Signup + Monnify reserved account | 25s | 0:40 |
| Dashboard insights | 30s | 1:10 |
| Voice logging + Monnify inflow | 40s | 1:50 |
| Send money to beneficiary | 35s | 2:25 |
| Ask a question + savings goal | 25s | 2:50 |
| Persistence + close | 10s | 3:00 |

**If you're running over:** cut the "ask a question" beat (merge it into
the savings-goal beat) — the Monnify inflow + send-money beats already prove
real money movement, which is the hackathon's core requirement.

**Key hackathon moments the judges must see:**
1. Reserved account number appears on signup (Monnify API call)
2. Balance updates automatically via Monnify webhook (no user action)
3. Real outbound transfer to a verified beneficiary (Monnify Single Transfer)
