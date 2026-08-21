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

## `20260813090000_match_quantity` is rolling-deploy safe

It adds two nullable columns to `Match` and backfills nothing, so old code
ignores them and new code reads null as "no amount was ever agreed" — which
is the truth about every match that predates the column. Both builds can
serve at once.

Deliberately no backfill: guessing what historical engagements were for
would put invented numbers into the record that remaining-capacity
arithmetic then treats as fact. An engagement with no quantity consumes no
capacity, which is the honest reading of an agreement whose size nobody
recorded.

## Product catalogue seeding

`npm start` also runs `prisma/seed-products.ts`. Every write is an idempotent
upsert and it never reassigns an alias a human has claimed, so re-running it
on each boot is safe and is how new products and aliases reach production
without a migration.

## `20260813140000_bilateral_agreement` is rolling-deploy safe

It adds two tables and two enum values, and rewrites no existing row. Old
code never sees `NEGOTIATING` or `AGREED` because it never writes them, and
new code reads a legacy `ACCEPTED` row as an engagement whose consent was
never proven. Both builds can serve at once.

Note for any future migration: `ALTER TYPE ... ADD VALUE` may not be used in
the same transaction that adds it. Nothing here does — the migration adds
values and backfills nothing — but a later migration that both adds an enum
value and writes it must be split in two.

### Legacy `ACCEPTED` is not consent, and is not backfilled into it

Before this release one party could move a match to `ACCEPTED` alone, and
after quantity semantics landed that reserved the counterparty's capacity.
Nothing recorded who had accepted, so there is no way to tell an agreed
trade from a stranger's unanswered click.

The policy, chosen because the alternatives all involve inventing facts:

- **`ACCEPTED` with no terms rows** — reserves nothing. Both parties are
  asked to agree properly. On deploy this *releases* capacity that was
  reserved without consent, which is a correction rather than a loss: the
  quantity stays on the row and seeds the terms when someone proposes them.
- **`COMPLETED` with no terms rows** — grandfathered, still reserving its
  `Match.quantity`. Two `TransactionConfirmation` rows exist on every
  completed match, so both parties demonstrably acted. That is evidence in
  the record, not an assumption about it.

Operationally this means live pilot engagements sitting in `ACCEPTED` will
show as needing agreement after deploy. Tell those users before shipping;
the alternative is honouring reservations nobody agreed to.

## `20260813180000_canonical_units` is rolling-deploy safe

It adds two nullable columns and backfills them from an exact CASE over the
alias table in `src/lib/measurement.ts`. Old code ignores the columns; new
code reads a NULL `unitCode` as "this quantity cannot be compared with
anything", which is the correct reading of a unit nobody can resolve.

### Migration resolution report

Against the development database at time of writing:

| Outcome | Rows | Detail |
|---|---|---|
| Deterministic | 9 | `"TONNE"` → `METRIC_TONNE` |
| Contextual (identity recorded, no conversion) | 1 | `"BAG"` → `BAG` |
| Unresolved | 0 | — |
| Ambiguous | 0 | — |
| No unit stated | 15 | transport/equipment intents; left NULL, unchanged in behaviour |

Every unit-bearing row resolved. **That number is not a target.** Where a
term is not an exact alias the column is left NULL on purpose: an intent
measured in "punnets" is a perfectly good intent whose quantity FarmaTrade
cannot compare with anything, and writing a guessed code onto it would put
an invented tonnage into the capacity arithmetic.

`ProduceStock` is not migrated. Its `ProduceUnit` enum maps into the
canonical set through `PRODUCE_UNIT_CANONICAL`, a function the Record type
makes total — a new enum value cannot be added without a canonical meaning,
and a test asserts every value maps and agrees with what the alias table
resolves the same label to. There is no second vocabulary to migrate, and no
inventory row is read or written.

### Behaviour change on deploy

Capacity figures are now reported in canonical units — kilograms for mass.
An intent authorized as "2 tonnes" reports `authorized: 2000`. Anything
consuming `Capacity` numerically must render through `basis` rather than
assuming the owner's original unit.

## `20260813210000_price_semantics` is rolling-deploy safe

Adds one enum and three nullable columns to each of `Intent` and
`AgreementTerms`, and rewrites nothing. Old code ignores them; new code
reads a NULL `priceBasis` as "this number's meaning was never recorded".

### No backfill, deliberately

Existing `askingPrice` values are bare numbers of genuinely unknown meaning
— `estimatedIntentValue` multiplied them by quantity while
`loadPriceSignals` divided by it, and the form said only "Price (optional)".
See `docs/pricing.md` for the evidence search and why the value ranges were
not treated as proof.

### Behaviour change on deploy

- Opportunity cards **stop showing "Est. value"** for pre-existing priced
  intents. That line was computed by the multiplying reader and was wrong
  wherever the number was a total.
- Price signals **stop including** pre-existing priced intents, so ranges
  will be sparser until farmers re-enter prices with an explicit basis. Any
  range shown is now built only from prices that state what they mean.
- New intents and terms require a basis and currency through the UI; both
  forms now ask.

## Pilot stop/start runbook and rehearsal — 2026-08-21

Because `20260809150000_post_to_intent` is not rolling-safe, the first pilot
deploy must use this exact sequence:

1. In Neon, create a restorable snapshot/branch and record its identifier.
2. Disable pilot writes and stop every Render application instance. Confirm
   there is no old instance or zero-downtime overlap still accepting requests.
3. Deploy the new build and run `npm start`. Its ordered startup runs
   `prisma migrate deploy`, then the idempotent product catalogue seed, then
   `next start`; do not run the general demo seed against pilot data.
4. Confirm all 20 migrations are applied with `npx prisma migrate status`.
5. Smoke `/login`, authenticate one designated test pilot, and read an
   existing Farm, Trade and opportunity record before restoring writes.
6. Confirm Sentry receives a deliberate test exception, Render shows the
   deploy/request logs and bandwidth, and Neon shows connections/query/transfer.
7. Re-enable writes only after those checks pass.

The rollback boundary is the first successful schema migration. The old build
cannot run against the renamed schema. If migration or smoke verification
fails after that boundary, keep writes stopped, stop the new build, restore the
recorded Neon snapshot/branch, and then restart the old build. Do not attempt to
roll the rename backward in place.

A disposable local rehearsal started from `origin/main` (11 migrations), ran
the existing demo seed, and captured an 89,147-byte custom-format `pg_dump`.
With all application writers stopped, `prisma migrate deploy` applied the nine
remaining migrations and `prisma/seed-products.ts` installed 26 products and
110 aliases. The renamed `Intent` table retained all 15 former `Post` rows and
all 9 users. `npm run build` succeeded; `npm start` reported no pending
migrations, repeated the seed safely, and served `/login` with HTTP 200 while
an unauthenticated `/dashboard` correctly returned 307 to `/login`. Restoring
the pre-upgrade dump into a second disposable database recovered all 15 Post
rows and 9 users.

This proves the repository sequence and recovery artifact, not access to the
production services. Before launch, the account holder must still execute and
record the Neon snapshot, Render write-stop/no-overlap confirmation, authenticated
pilot smoke, and the three external observability checks above.
