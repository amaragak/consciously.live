# @consciously/marketing

Next.js marketing site (and transitional logged-in routes not yet moved to the Vite SPA).

## Deploy (AWS / SST)

**Frontend production** is owned by GitHub Actions (`.github/workflows/deploy.yml` on `main`). Prefer push / re-run the workflow — don’t run local `--stage prod` in parallel or you’ll hit the SST state lock. **Backend** (`backend/scripts/deploy-back`) stays fine to run locally for continued API work; this restriction is frontend-only.

Deploys **marketing** (`consciously.live`) and **app** (`app.consciously.live`) together.

From `frontend/marketing/deploy/` (after `npm install` and `npm run install-platform`):

```bash
npm run deploy:dev
# emergency local prod only:
MEDIMADE_ALLOW_LOCAL_PROD_DEPLOY=1 npm run deploy:prod
```

From repo root:

```bash
./frontend/marketing/deploy/deploy-web --stage dev
MEDIMADE_ALLOW_LOCAL_PROD_DEPLOY=1 ./frontend/marketing/deploy/deploy-web --stage production
```

`frontend/marketing/.env` is sourced when present so `NEXT_PUBLIC_*` / `VITE_*` values are baked into the builds.

Set `NEXT_PUBLIC_APP_ORIGIN` (default `https://app.consciously.live`) for Focus redirects.

## Local

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
