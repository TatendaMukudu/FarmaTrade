-- Agricultural OS layers: capabilities, objectives, multidimensional trust,
-- operational memory, market signals.
--
-- Hand-written rather than taken straight from `prisma migrate diff`, which
-- would have dropped Party.roles outright and defaulted every Post.objective
-- to SELL — including NEED posts, which have always meant BUY. Both columns
-- are backfilled below before the old one goes.

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('FARMER', 'BUYER', 'SUPPLIER', 'TRANSPORTER', 'MECHANIC', 'VETERINARIAN', 'AGRONOMIST', 'LABOR_PROVIDER', 'COLD_STORAGE', 'PROCESSOR', 'EXPORTER', 'CONTRACTOR', 'FINANCIER', 'INSURER', 'DRONE_OPERATOR', 'INSPECTOR', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "Objective" AS ENUM ('SELL', 'BUY', 'RENT_OUT', 'RENT', 'HIRE_LABOR', 'FIND_WORK', 'REPAIR_SERVICE', 'NEED_REPAIR', 'TRANSPORT_OFFER', 'TRANSPORT_NEED', 'STORAGE_OFFER', 'STORAGE_NEED', 'FINANCE_OFFER', 'FINANCE_NEED', 'INSPECT_OFFER', 'INSPECT_NEED', 'EXPORT_OFFER', 'EXPORT_NEED');

-- CreateEnum
CREATE TYPE "TrustDimension" AS ENUM ('COMMUNICATION', 'RELIABILITY', 'QUALITY', 'PAYMENT', 'TIMELINESS', 'FAIRNESS');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('HARVEST', 'SOLD', 'BOUGHT', 'TRANSPORT_HIRED', 'TRANSPORT_PROVIDED', 'EQUIPMENT_RENTED_OUT', 'EQUIPMENT_RENTED_IN', 'MAINTENANCE', 'INPUTS_PURCHASED', 'LABOR_HIRED', 'STORAGE_USED');

-- CreateEnum
CREATE TYPE "SignalKind" AS ENUM ('DEMAND_RISING', 'DEMAND_FALLING', 'SUPPLY_TIGHT', 'SUPPLY_GLUT', 'TRANSPORT_SCARCE', 'TRANSPORT_AVAILABLE', 'PRICE_RISING', 'PRICE_FALLING');

-- AlterTable: Party gains capabilities + the operating-profile fields.
ALTER TABLE "Party"
  ADD COLUMN "capabilities" "Capability"[],
  ADD COLUMN "availabilityNote" TEXT,
  ADD COLUMN "languages" TEXT[],
  ADD COLUMN "licenses" TEXT[],
  ADD COLUMN "operatingRadiusKm" INTEGER,
  ADD COLUMN "yearsExperience" INTEGER;

-- Backfill capabilities from the old three-role model before dropping it.
-- FARM -> FARMER. TRANSPORTER -> TRANSPORTER. TRADER was the catch-all for
-- "buys and/or sells with no farm of their own", so it becomes both BUYER
-- and SUPPLIER — narrowing it to one would silently drop half of what an
-- existing trader account is currently telling the matching engine.
UPDATE "Party" SET "capabilities" = COALESCE((
  SELECT ARRAY(
    SELECT DISTINCT c FROM unnest("roles") AS r,
    LATERAL unnest(
      CASE r::text
        WHEN 'FARM'        THEN ARRAY['FARMER']::"Capability"[]
        WHEN 'TRADER'      THEN ARRAY['BUYER', 'SUPPLIER']::"Capability"[]
        WHEN 'TRANSPORTER' THEN ARRAY['TRANSPORTER']::"Capability"[]
        ELSE ARRAY[]::"Capability"[]
      END
    ) AS c
  )
), ARRAY[]::"Capability"[]);

ALTER TABLE "Party" DROP COLUMN "roles";

-- DropEnum
DROP TYPE "PartyRole";

-- AlterTable: Post gains the objective (what the poster is trying to do).
ALTER TABLE "Post" ADD COLUMN "objective" "Objective" NOT NULL DEFAULT 'SELL';

-- Backfill: a NEED post has always meant "I want to buy this". HAVE keeps
-- the SELL default, which is what it meant.
UPDATE "Post" SET "objective" = 'BUY' WHERE "type" = 'NEED';

-- AlterTable: per-dimension trust aggregates.
ALTER TABLE "Reputation"
  ADD COLUMN "communicationAvg" DOUBLE PRECISION,
  ADD COLUMN "reliabilityAvg" DOUBLE PRECISION,
  ADD COLUMN "qualityAvg" DOUBLE PRECISION,
  ADD COLUMN "paymentAvg" DOUBLE PRECISION,
  ADD COLUMN "timelinessAvg" DOUBLE PRECISION,
  ADD COLUMN "fairnessAvg" DOUBLE PRECISION,
  ADD COLUMN "dimensionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "repeatPartnerCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "medianResponseMinutes" INTEGER;

-- CreateTable
CREATE TABLE "RatingDimension" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "dimension" "TrustDimension" NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "RatingDimension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEvent" (
    "id" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "PostCategory",
    "counterpartyId" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "matchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "category" "PostCategory" NOT NULL,
    "subject" TEXT,
    "province" TEXT,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RatingDimension_ratingId_idx" ON "RatingDimension"("ratingId");

-- CreateIndex
CREATE UNIQUE INDEX "RatingDimension_ratingId_dimension_key" ON "RatingDimension"("ratingId", "dimension");

-- CreateIndex
CREATE INDEX "MemoryEvent_partyId_kind_occurredAt_idx" ON "MemoryEvent"("partyId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "MemoryEvent_partyId_subject_idx" ON "MemoryEvent"("partyId", "subject");

-- CreateIndex
CREATE INDEX "MemoryEvent_category_occurredAt_idx" ON "MemoryEvent"("category", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketSignal_province_category_computedAt_idx" ON "MarketSignal"("province", "category", "computedAt");

-- CreateIndex
CREATE INDEX "MarketSignal_computedAt_idx" ON "MarketSignal"("computedAt");

-- CreateIndex
CREATE INDEX "Party_capabilities_idx" ON "Party"("capabilities");

-- AddForeignKey
ALTER TABLE "RatingDimension" ADD CONSTRAINT "RatingDimension_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "Rating"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEvent" ADD CONSTRAINT "MemoryEvent_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEvent" ADD CONSTRAINT "MemoryEvent_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
