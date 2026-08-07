-- Reputation provenance: how many different counterparties a record is built
-- from, and how evenly spread across them. Together these separate a genuine
-- track record from a two-account ring that traded with itself — both can
-- reach the same trade count and star average.
ALTER TABLE "Reputation"
  ADD COLUMN "distinctPartnerCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tradeBreadth" DOUBLE PRECISION NOT NULL DEFAULT 0;
