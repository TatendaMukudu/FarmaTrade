-- AlterTable
ALTER TABLE "Reputation" ADD COLUMN     "didNotHappenCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the confirmations that were already being recorded and
-- discarded, so the column is correct on existing rows rather than only on
-- parties who confirm something after this deploys.
UPDATE "Reputation" r
SET "didNotHappenCount" = c.count
FROM (
  SELECT "partyId", COUNT(*)::int AS count
  FROM "TransactionConfirmation"
  WHERE "outcome" = 'DID_NOT_HAPPEN'
  GROUP BY "partyId"
) c
WHERE r."partyId" = c."partyId";
