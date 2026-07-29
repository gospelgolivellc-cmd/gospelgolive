# GospelGoLive ingest relay

Always-on relay for the in-browser camera "Go Live" feature. See the comment
at the top of `server.js` for why this has to be a separate, always-on
service rather than living inside the main app's API routes.

## Deploy on Railway (recommended — no Dockerfile needed)

1. Go to https://railway.com and sign up / log in.
2. **New Project → Deploy from GitHub repo** → pick this repo.
3. Once created, open the service's **Settings** tab:
   - **Root Directory**: set to `relay-service`
   - Railway auto-detects the Node app from `package.json` and runs `npm start` — no other build config needed.
4. Open the **Variables** tab and add:
   - `INGEST_RELAY_SECRET` — set it to the exact same value as `INGEST_RELAY_SECRET` in the main app's `.env.local` (ask for this value if you don't have it handy).
5. Open **Settings → Networking** and click **Generate Domain** to get a public HTTPS URL.
6. Send that URL back — the main app's `INGEST_RELAY_URL` env var (in Vercel) gets set to it to finish wiring things up.

## Deploy on Fly.io instead

The included `Dockerfile` works as-is:

```bash
cd relay-service
fly launch --no-deploy   # picks a name, region; keep the generated fly.toml
fly secrets set INGEST_RELAY_SECRET=<same value as above>
fly deploy
```

Fly gives you a URL like `https://<app-name>.fly.dev` — send that back the same way.

## Verifying it's up

```bash
curl https://<your-relay-url>/health
# {"ok":true,"activeSessions":0}
```
