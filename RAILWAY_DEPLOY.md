# Deploying the Zuri backend to Railway

The backend is already Railway-ready: [`backend/Procfile`](backend/Procfile)
defines the start command and [`/health`](backend/app/main.py) is a ready
health-check endpoint. Railway auto-detects Python via `requirements.txt`, so
no Dockerfile is needed.

> One catch: Zuri uses **SQLite** (`backend/zuri.db`), written to local disk.
> Railway's filesystem is ephemeral on redeploy (same as Render free tier) —
> fine for a demo, not for real persistence. See "Persistent data" below if
> you need the DB to survive deploys.

---

## 1. Push your code

Railway deploys from a GitHub repo (or the CLI). If you haven't already:

```bash
git add -A
git commit -m "your message"
git push
```

## 2. Create the Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from
   GitHub repo** → pick your Zuri repo.
2. Since the backend lives in a subfolder, set the **Root Directory** to
   `backend` (Settings → Source → Root Directory). This makes Railway treat
   `backend/` as the project root, so `requirements.txt` and `Procfile` are
   found automatically.

## 3. Set environment variables

In the service's **Variables** tab, add:

| Variable | Value |
|---|---|
| `JWT_SECRET` | a long random string (`openssl rand -hex 32`, or let Railway generate one) |
| `OPENAI_API_KEY` | your OpenAI key (leave blank to disable AI features) |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | your frontend URL, e.g. `https://your-app.vercel.app` |

Do **not** set `PORT` manually — Railway injects it, and the `Procfile`
already reads `$PORT`.

## 4. Deploy

Railway builds and deploys automatically once Root Directory + variables are
set. Watch the **Deployments** tab for build logs. On success, generate a
public URL: **Settings → Networking → Generate Domain**. You'll get something
like `https://zuri-backend-production.up.railway.app`.

## 5. Verify

```bash
curl https://<your-railway-domain>/health
```

Should return a 200. Then hit `/docs` in the browser for the Swagger UI to
confirm routes are live.

## 6. Point the frontend at it

In your frontend deploy (Vercel etc.), set the build env var:

```
VITE_API_URL=https://<your-railway-domain>
```

And make sure that frontend URL is in the backend's `ALLOWED_ORIGINS` (step
3) — otherwise the browser will block API calls with a CORS error.

---

## Persistent data (optional)

If you want `zuri.db` to survive redeploys instead of resetting:

1. In the Railway service, go to **Settings → Volumes** → add a volume,
   mount path e.g. `/data`.
2. The app needs to write the SQLite file there instead of the repo-relative
   default — check `backend/app/database.py` for the DB path and point it at
   `/data/zuri.db` via an env var if one isn't wired up yet (it isn't
   currently — this would need a small code change to read a `DB_PATH` env
   var). Skip this for a demo; the ephemeral default is fine.

---

## Troubleshooting

- **Build fails on `bcrypt`** — Railway's default Python image usually has
  build tools for it already; if not, it's a native wheel issue — pin to the
  same `bcrypt==4.0.1` already in `requirements.txt` (already done here).
- **App crashes with `ModuleNotFoundError: No module named 'app'`** — Root
  Directory isn't set to `backend`, so Railway is running from the repo root.
  Fix in Settings → Source.
- **CORS errors in the browser** — `ALLOWED_ORIGINS` doesn't include your
  exact frontend origin (scheme + host, no trailing slash).
- **Chat/voice endpoints 500** — `OPENAI_API_KEY` missing or invalid; check
  the deployment logs.
