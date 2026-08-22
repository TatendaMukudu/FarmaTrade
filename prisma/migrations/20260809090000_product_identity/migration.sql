-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('CROP', 'LIVESTOCK');

-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('SEEDED', 'LEARNED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAlias" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "locale" TEXT,
    "source" "AliasSource" NOT NULL DEFAULT 'SEEDED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_key_key" ON "Product"("key");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- One normalized term resolves to at most one product. Enforced in the
-- database rather than only in application code, because the whole value of
-- this table is that "mhunga" can never mean two things.
-- CreateIndex
CREATE UNIQUE INDEX "ProductAlias_normalized_key" ON "ProductAlias"("normalized");

-- CreateIndex
CREATE INDEX "ProductAlias_productId_idx" ON "ProductAlias"("productId");

-- AddForeignKey
ALTER TABLE "ProductAlias" ADD CONSTRAINT "ProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "ProduceStock" ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "Post_productId_status_type_idx" ON "Post"("productId", "status", "type");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProduceStock" ADD CONSTRAINT "ProduceStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The catalogue itself is reference data, seeded here rather than in a
-- script, so a fresh database and a migrated one agree. Products and aliases
-- are inserted by `prisma/seed-products.ts` on deploy (idempotent upsert) --
-- this migration only creates the shape. Backfilling Post.productId and
-- ProduceStock.productId from existing free-text cropType happens in the
-- same script, since it needs the normalization rules that live in
-- src/lib/products.ts rather than a hand-written SQL LOWER()/REPLACE chain
-- that would inevitably drift from them.
