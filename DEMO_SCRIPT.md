# Zuri — 3-Minute Demo Script

Total runtime target: **2:50–3:00**. Timestamps assume a natural speaking
pace (~150 wpm) — rehearse once and trim pauses, not words, if you're running
long. Pair with [`DEPLOY_DEMO.md`](DEPLOY_DEMO.md) for setup/mic prep.

---

## 0:00–0:15 — Landing page

**Screen:** Landing page → click through to sign up.

> "This is Zuri — an AI money diary. No bank connection, no OAuth, no OTP.
> You just tell it what you earned or spent, by voice or text, in English,
> Pidgin, Yoruba, Igbo, or Hausa — and it narrates your money back to you."

---

## 0:15–0:35 — Onboarding

**Screen:** Enter starting balance, monthly income, one or two recurring
expenses (e.g. Rent ₦150,000, Netflix ₦3,900). Set 4-digit PIN.

> "Setup takes seconds — starting balance, rough income, a couple of
> recurring bills. Zuri backdates a bit of history so your insights aren't
> empty on day one."

---

## 0:35–1:05 — Dashboard: spend intelligence

**Screen:** Land on dashboard. Point at runway, this-week-vs-last-week,
category breakdown.

> "Here's the dashboard. Runway — how many days my balance actually covers.
> Week-over-week spend. Category breakdown. None of this is an AI guess —
> it's a deterministic engine computing real numbers from real entries. The
> AI only ever quotes them, it never invents them."

---

## 1:05–1:50 — Voice logging (the core loop)

**Screen:** Tap the mic, speak: *"I just spent five thousand naira on
fuel."*

> "Now watch the voice loop. I tap the mic and just talk."

**[speak the line — live caption appears while talking]**

> "Zuri transcribes it, logs the expense as a tool call, updates my balance,
> and replies — out loud and in the chat. No forms, no menus."

**Screen:** Balance updates, chat shows Zuri's reply.

---

## 1:50–2:20 — Ask a question

**Screen:** Type or speak: *"How is my spending looking this month?"*

> "I can also just ask it things."

**[send the message]**

> "It answers with the exact computed figures — burn rate, runway, top
> category — not a vibe, an actual number pulled from the insights engine."

---

## 2:20–2:45 — Savings goal

**Screen:** Speak or type: *"Help me save 600k for rent by December."*

> "One more: I can ask it to set up a savings goal, and it works out a
> monthly pace for me automatically — no calculator required."

**Screen:** New goal card appears with computed monthly target.

---

## 2:45–3:00 — Persistence + close

**Screen:** Refresh the page. Chat history is still there.

> "And if I refresh — nothing's lost. Every conversation is stored
> server-side. That's Zuri: talk to it like a person, get your money back in
> plain numbers."

**[end]**

---

## Timing cheat sheet

| Segment | Duration | Cumulative |
|---|---|---|
| Landing | 15s | 0:15 |
| Onboarding | 20s | 0:35 |
| Dashboard insights | 30s | 1:05 |
| Voice logging | 45s | 1:50 |
| Ask a question | 30s | 2:20 |
| Savings goal | 25s | 2:45 |
| Persistence + close | 15s | 3:00 |

**If you're running over:** cut the "ask a question" beat (1:50–2:20) — the
voice-logging beat alone already proves the core loop, and the savings-goal
beat proves tool-calling generalizes beyond expense logging.
