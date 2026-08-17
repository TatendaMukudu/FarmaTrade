-- Explicit price semantics.
--
-- Expand-only, nullable, and DELIBERATELY NOT BACKFILLED.
--
-- Every existing askingPrice is a bare number written before anything
-- recorded what it meant. Two modules read those numbers in contradictory
-- ways — estimatedIntentValue multiplied by quantity (a rate), while
-- loadPriceSignals divided by it (a total) — and the form only ever said
-- "Price (optional)". There is no evidence in the repository that settles
-- it: the seed creates no priced intents at all, and the priced rows in the
-- development database are fixtures written during this rebuild, not
-- anything a farmer typed.
--
-- A backfill would therefore be a guess applied uniformly to rows that may
-- genuinely differ from one another, and it would be wrong silently — a
-- price read as a rate when it was a total overstates a deal by the
-- quantity factor, which for ten tonnes is a factor of ten. Leaving
-- priceBasis NULL costs a display line ("price not stated in a form we can
-- total") and keeps the uncertainty visible where somebody can resolve it
-- by asking.

CREATE TYPE "PriceBasis" AS ENUM ('TOTAL', 'PER_UNIT');

ALTER TABLE "Intent" ADD COLUMN "priceCurrency" TEXT;
ALTER TABLE "Intent" ADD COLUMN "priceBasis" "PriceBasis";
ALTER TABLE "Intent" ADD COLUMN "priceUnitCode" TEXT;

ALTER TABLE "AgreementTerms" ADD COLUMN "priceCurrency" TEXT;
ALTER TABLE "AgreementTerms" ADD COLUMN "priceBasis" "PriceBasis";
ALTER TABLE "AgreementTerms" ADD COLUMN "priceUnitCode" TEXT;
