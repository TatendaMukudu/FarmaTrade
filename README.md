# FarmaTrade

The digital operating layer for farm owners who don't work the land themselves.

## Getting started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in `DATABASE_URL` (Postgres) and
`SESSION_SECRET` first.

## Seed data

```bash
npm run db:seed
```

Wipes and repopulates the local database with a handful of demo accounts
(farms, traders, transporters across four provinces) so the app doesn't
start empty. Login credentials print to the console when it runs — all
seeded accounts share one password, overridable via `SEED_PASSWORD`.

## Deploying (Render + Neon)

`render.yaml` at the repo root is a Render Blueprint — Render reads it and
provisions the web service for you.

1. In Neon, create a project/database and copy its connection string
   (includes `?sslmode=require`).
2. In Render: **New → Blueprint**, connect this repo, and pick the branch
   that has the code (currently `claude/exclusive-farmatrade-session-6r0qkt`
   — `render.yaml` points at it explicitly since it hasn't been merged to
   `main` yet; repoint that `branch:` field once it has).
3. When prompted for env vars, paste the Neon connection string in for
   `DATABASE_URL`. `SESSION_SECRET` is generated for you automatically —
   the value in `.env` is a dev-only fallback, never reused in production.
4. Deploy. `preDeployCommand` runs `prisma migrate deploy` against Neon
   before the new build goes live, so the schema stays in sync on every
   deploy without a manual step.

Seeding a production database is a separate, deliberate action —
`npm run db:seed` wipes every table, so it refuses to run when
`NODE_ENV=production` unless `SEED_CONFIRM=WIPE` is also set. Don't run it
against a database with real signups on it.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
