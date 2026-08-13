# Deployment constraints

## `20260809150000_post_to_intent` is not rolling-deploy safe

This migration renames the `Post` table to `Intent`, renames its enum
**types and values** (`HAVE`/`NEED` → `SUPPLY`/`DEMAND`,
`DRAFT`/`OPEN`/`MATCHED`/`CLOSED` → `PROPOSED`/`ACTIVE`/`ENGAGED`/`WITHDRAWN`),
and renames foreign-key columns on `Match` and `Photo`.

**Old application code and the new schema cannot coexist.** The moment the
migration commits, any process still running the previous build fails on
every query touching intents — the table it selects from no longer exists,
and the enum values it writes are no longer valid.

That makes this a stop-start release, not a rolling one:

1. Stop all application instances.
2. Run `prisma migrate deploy`.
3. Start instances on the new build.

`npm start` runs `prisma migrate deploy` before `next start`, which is safe
for a single-instance deploy (Render's default) because the old container is
already stopped. It is **not** safe if more than one instance is running, or
if a platform is configured for zero-downtime overlap — the migration would
land while the old container is still serving.

If FarmaTrade ever moves to multi-instance or zero-downtime deploys, this
migration is the reason a rename must first be done expand/contract: add the
new name, write to both, migrate readers, then drop the old one. Nothing in
the current history follows that pattern, because nothing needed to.

## Product catalogue seeding

`npm start` also runs `prisma/seed-products.ts`. Every write is an idempotent
upsert and it never reassigns an alias a human has claimed, so re-running it
on each boot is safe and is how new products and aliases reach production
without a migration.
