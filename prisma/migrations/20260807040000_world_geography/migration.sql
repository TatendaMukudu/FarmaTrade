-- Real geography, replacing administrative-name equality.
--
-- Matching qualified candidates with `province = province` — an exact string
-- compare on an administrative label. That made cross-border trade
-- impossible by construction (Mutare->Beira is 290km, Mutare->Bulawayo is
-- 580km; only the far one could ever match), didn't survive leaving
-- Zimbabwe, and was already wrong for two farms either side of a provincial
-- boundary.
--
-- province/district are renamed rather than dropped and recreated, so every
-- existing row keeps its value. Coordinates are then backfilled from the
-- region centroids in countries.ts.

-- Party ---------------------------------------------------------------
ALTER TABLE "Party" RENAME COLUMN "province" TO "region";
ALTER TABLE "Party" RENAME COLUMN "district" TO "locality";
ALTER TABLE "Party" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'ZW';

DROP INDEX IF EXISTS "Party_province_district_idx";
CREATE INDEX "Party_countryCode_region_locality_idx" ON "Party"("countryCode", "region", "locality");
CREATE INDEX "Party_latitude_longitude_idx" ON "Party"("latitude", "longitude");

-- Post ----------------------------------------------------------------
ALTER TABLE "Post" RENAME COLUMN "province" TO "region";
ALTER TABLE "Post" RENAME COLUMN "district" TO "locality";
ALTER TABLE "Post" ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'ZW';
ALTER TABLE "Post" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Post" ADD COLUMN "longitude" DOUBLE PRECISION;

DROP INDEX IF EXISTS "Post_category_status_province_district_idx";
CREATE INDEX "Post_category_status_countryCode_region_idx" ON "Post"("category", "status", "countryCode", "region");
CREATE INDEX "Post_status_latitude_longitude_idx" ON "Post"("status", "latitude", "longitude");

-- MarketSignal --------------------------------------------------------
ALTER TABLE "MarketSignal" RENAME COLUMN "province" TO "region";
ALTER TABLE "MarketSignal" ADD COLUMN "countryCode" TEXT;

DROP INDEX IF EXISTS "MarketSignal_province_category_computedAt_idx";
CREATE INDEX "MarketSignal_countryCode_region_category_computedAt_idx" ON "MarketSignal"("countryCode", "region", "category", "computedAt");

-- Backfill coordinates from Zimbabwe province centroids. Every existing row
-- predates multi-country support, so all of them are ZW by definition.
-- Parties first, then posts inherit from their party — a post's location is
-- where the goods are, and before this migration that was always the
-- posting party's own location.
UPDATE "Party" p SET "latitude" = c.lat, "longitude" = c.lon
FROM (VALUES
  ('Harare',               -17.83, 31.05),
  ('Bulawayo',             -20.15, 28.58),
  ('Manicaland',           -18.97, 32.67),
  ('Mashonaland Central',  -16.78, 31.08),
  ('Mashonaland East',     -18.19, 31.55),
  ('Mashonaland West',     -17.36, 30.20),
  ('Masvingo',             -20.07, 30.83),
  ('Matabeleland North',   -18.53, 27.50),
  ('Matabeleland South',   -21.05, 29.05),
  ('Midlands',             -19.45, 29.82)
) AS c(name, lat, lon)
WHERE p."region" = c.name AND p."latitude" IS NULL;

UPDATE "Post" po
SET "latitude" = pa."latitude", "longitude" = pa."longitude"
FROM "Party" pa
WHERE po."partyId" = pa."id" AND po."latitude" IS NULL;

UPDATE "MarketSignal" SET "countryCode" = 'ZW' WHERE "region" IS NOT NULL;
