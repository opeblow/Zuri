---
title: Zuri Backend
emoji: 📒
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Zuri Backend

API for **Zuri** — an AI money diary. FastAPI + SQLite on a free Hugging Face
Space (CPU basic, 16 GB RAM).

Interactive API docs: `/docs`.

## Environment variables (Settings -> Variables and secrets)

| Variable          | Required | Description |
| ----------------- | -------- | ----------- |
| `JWT_SECRET`      | yes      | Secret used to sign access tokens |
| `OPENAI_API_KEY`  | no       | Chat agent, Whisper STT, TTS (blank disables AI features) |
| `NODE_ENV`        | no       | Set to `production` |
| `ALLOWED_ORIGINS` | no       | Comma-separated frontend origins allowed via CORS (e.g. `https://your-app.vercel.app`) |

`PORT` is defaulted to `7860` (Hugging Face's app port) so no manual setting is
needed.