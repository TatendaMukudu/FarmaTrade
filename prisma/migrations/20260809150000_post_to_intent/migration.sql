-- Post -> Intent: a physical rename and nothing else.
--
-- Every statement here is a RENAME. No rows are rewritten, no columns are
-- dropped, no defaults change meaning, and no behaviour changes. That is the
-- point: the product concept moved in the previous checkpoint, so this one
-- can be boring.
--
-- Enum VALUES are renamed too, not just the types. HAVE/NEED describe
-- possession; SUPPLY/DEMAND describe market participation, and a party can
-- hold 26 tonnes while supplying none. PostStatus becomes commercial rather
-- than editorial.
--
-- One thing this deliberately does NOT do: it does not make ENGAGED
-- terminal. MATCHED never meant "finished" and ENGAGED must not start to.
-- An intent can be engaged while still partly available, carry several
-- matches, or return to ACTIVE when a negotiation falls through.

-- ---------------------------------------------------------------------------
-- Enum types and their values
-- ---------------------------------------------------------------------------
ALTER TYPE "PostType" RENAME TO "IntentSide";
ALTER TYPE "IntentSide" RENAME VALUE 'HAVE' TO 'SUPPLY';
ALTER TYPE "IntentSide" RENAME VALUE 'NEED' TO 'DEMAND';

ALTER TYPE "PostStatus" RENAME TO "IntentStatus";
ALTER TYPE "IntentStatus" RENAME VALUE 'DRAFT' TO 'PROPOSED';
ALTER TYPE "IntentStatus" RENAME VALUE 'OPEN' TO 'ACTIVE';
ALTER TYPE "IntentStatus" RENAME VALUE 'MATCHED' TO 'ENGAGED';
ALTER TYPE "IntentStatus" RENAME VALUE 'CLOSED' TO 'WITHDRAWN';

-- Shared by Intent and Product, so named for neither.
ALTER TYPE "PostCategory" RENAME TO "CommerceCategory";

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
ALTER TABLE "Post" RENAME TO "Intent";
ALTER TABLE "Intent" RENAME COLUMN "type" TO "side";

-- The column default is stored as a literal referencing the old value name;
-- restate it against the renamed one.
ALTER TABLE "Intent" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- ---------------------------------------------------------------------------
-- Foreign keys pointing at it
-- ---------------------------------------------------------------------------
ALTER TABLE "Match" RENAME COLUMN "postAId" TO "intentAId";
ALTER TABLE "Match" RENAME COLUMN "postBId" TO "intentBId";
ALTER TABLE "Photo" RENAME COLUMN "postId" TO "intentId";

-- ---------------------------------------------------------------------------
-- Constraint and index names
--
-- Postgres keeps the old names when a table is renamed. Prisma derives
-- expected names from the schema, so leaving these would show as permanent
-- drift and every future migration would try to "fix" them.
-- ---------------------------------------------------------------------------
ALTER INDEX "Post_pkey" RENAME TO "Intent_pkey";
ALTER TABLE "Intent" RENAME CONSTRAINT "Post_partyId_fkey" TO "Intent_partyId_fkey";
ALTER TABLE "Intent" RENAME CONSTRAINT "Post_livestockId_fkey" TO "Intent_livestockId_fkey";
ALTER TABLE "Intent" RENAME CONSTRAINT "Post_produceId_fkey" TO "Intent_produceId_fkey";
ALTER TABLE "Intent" RENAME CONSTRAINT "Post_equipmentId_fkey" TO "Intent_equipmentId_fkey";
ALTER TABLE "Intent" RENAME CONSTRAINT "Post_productId_fkey" TO "Intent_productId_fkey";

ALTER INDEX "Post_category_status_countryCode_province_district_idx" RENAME TO "Intent_category_status_countryCode_province_district_idx";
ALTER INDEX "Post_partyId_idx" RENAME TO "Intent_partyId_idx";
ALTER INDEX "Post_produceId_idx" RENAME TO "Intent_produceId_idx";
ALTER INDEX "Post_category_status_openToCrossBorder_idx" RENAME TO "Intent_category_status_openToCrossBorder_idx";
ALTER INDEX "Post_productId_status_type_idx" RENAME TO "Intent_productId_status_side_idx";

ALTER TABLE "Match" RENAME CONSTRAINT "Match_postAId_fkey" TO "Match_intentAId_fkey";
ALTER TABLE "Match" RENAME CONSTRAINT "Match_postBId_fkey" TO "Match_intentBId_fkey";
ALTER INDEX "Match_postAId_postBId_key" RENAME TO "Match_intentAId_intentBId_key";
ALTER INDEX "Match_postBId_idx" RENAME TO "Match_intentBId_idx";

ALTER TABLE "Photo" RENAME CONSTRAINT "Photo_postId_fkey" TO "Photo_intentId_fkey";
ALTER INDEX "Photo_postId_idx" RENAME TO "Photo_intentId_idx";
