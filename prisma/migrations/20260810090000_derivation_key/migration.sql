-- A fingerprint of the farm state a DERIVED intent came from.
--
-- Null on everything existing: rows created before this column either were
-- typed by hand (DECLARED, which never has one) or were derived by the older
-- code that had no fingerprint. A derived row with a null key simply looks
-- stale to the engine, so its next run revises it in place and it acquires
-- one. Nothing needs backfilling.
-- AlterTable
ALTER TABLE "Intent" ADD COLUMN     "derivationKey" TEXT;

-- CreateIndex
CREATE INDEX "Intent_partyId_derivationKey_idx" ON "Intent"("partyId", "derivationKey");
