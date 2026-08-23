-- Allocated commercial quantity on a Match.
--
-- Expand-only and nullable, so this is rolling-deploy safe: old code ignores
-- the columns, new code reads null as "amount never agreed". No backfill —
-- every existing match genuinely was agreed without a quantity, and writing
-- a guessed number would be inventing history.
ALTER TABLE "Match" ADD COLUMN "quantity" DOUBLE PRECISION;
ALTER TABLE "Match" ADD COLUMN "unit" TEXT;
