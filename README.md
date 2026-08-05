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

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
