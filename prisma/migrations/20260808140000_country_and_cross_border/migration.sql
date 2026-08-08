-- Existing parties and posts are all from the Zimbabwe pilot, so the column
-- default is also the correct backfill for every row already in the table.
-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'ZW';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'ZW',
                  ADD COLUMN     "openToCrossBorder" BOOLEAN NOT NULL DEFAULT false;

-- The hot matching path now narrows on country before province, so the old
-- index is replaced rather than added to.
-- DropIndex
DROP INDEX "Post_category_status_province_district_idx";

-- CreateIndex
CREATE INDEX "Post_category_status_countryCode_province_district_idx" ON "Post"("category", "status", "countryCode", "province", "district");

-- CreateIndex
CREATE INDEX "Post_category_status_openToCrossBorder_idx" ON "Post"("category", "status", "openToCrossBorder");
