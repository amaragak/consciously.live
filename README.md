# Consciously / medimade.io

Monorepo after the marketing / app split:

| Path | Role |
|------|------|
| `frontend/marketing` | Next.js (SST/OpenNext) → `consciously.live` |
| `frontend/webapp` | Vite React SPA → `app.consciously.live` |
| `frontend/common` | Shared theme tokens, session helpers, playback UI (`@consciously/common`) |
| `frontend/extension` | Chrome extension |
| `frontend/mobile` | Expo app |
| `backend` | AWS CDK API / workers |

## Dev

```bash
# Both servers + localhost cross-links (.env.local)
npm run dev
# or: ./scripts/dev-web

# Or separately:
npm run dev:marketing   # :3000
npm run dev:webapp      # :5173
```

`scripts/dev-web` writes:
- `frontend/marketing/.env.local` → `NEXT_PUBLIC_APP_ORIGIN=http://localhost:5173`
- `frontend/webapp/.env.local` → `VITE_MARKETING_ORIGIN=http://localhost:3000` (+ API URLs)

Ports: `MARKETING_PORT=3000 APP_PORT=5173 ./scripts/dev-web`

## Deploy

**Frontend prod** → GitHub Actions (push to `main` / re-run Deploy). Local `--stage prod` is blocked unless `MEDIMADE_ALLOW_LOCAL_PROD_DEPLOY=1`.

**Backend** → fine locally anytime:

```bash
./backend/scripts/deploy-back --require-approval never
```

Frontend (CI or emergency local):

```bash
# CI owns this; emergency only:
MEDIMADE_ALLOW_LOCAL_PROD_DEPLOY=1 ./frontend/marketing/deploy/deploy-web --stage prod
```

Deploys marketing and/or webapp via SST (`--only marketing` / `--only app` / `--only all`).
