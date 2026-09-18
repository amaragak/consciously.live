# @consciously/marketing

Next.js marketing site (and transitional logged-in routes not yet moved to the Vite SPA).

## Deploy (AWS / SST)

Deploys **marketing** (`consciously.live`) and **app** (`app.consciously.live`) together.

From `frontend/marketing/deploy/` (after `npm install` and `npm run install-platform`):

```bash
npm run deploy:dev
npm run deploy:prod
```

From repo root:

```bash
./frontend/marketing/deploy/deploy-web --stage production
./frontend/marketing/deploy/deploy-web --stage production --profile other
```

`frontend/marketing/.env` is sourced when present so `NEXT_PUBLIC_*` / `VITE_*` values are baked into the builds.

Set `NEXT_PUBLIC_APP_ORIGIN` (default `https://app.consciously.live`) for Focus redirects.

## Local

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
