-- CreateEnum
CREATE TYPE "IntentOrigin" AS ENUM ('DERIVED', 'DECLARED');

-- Every existing row was typed by hand, so the column default is also the
-- correct backfill. Rows FarmaTrade drafted from an upcoming harvest are
-- corrected below.
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "origin" "IntentOrigin" NOT NULL DEFAULT 'DECLARED';

-- A post linked to a produce row was drafted by FarmaTrade from that row's
-- expected harvest date — the produce link is set by nothing else. Those
-- were derived, not declared.
UPDATE "Post" SET "origin" = 'DERIVED' WHERE "produceId" IS NOT NULL;
