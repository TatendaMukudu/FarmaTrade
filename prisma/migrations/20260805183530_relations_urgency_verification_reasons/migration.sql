-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('FOUNDER', 'NETWORK');

-- CreateEnum
CREATE TYPE "RelationKind" AS ENUM ('PREFERRED_PARTNER', 'RECURRING_BUYER');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "reasons" TEXT[];

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "verifiedBy" "VerificationSource";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "neededBy" TIMESTAMP(3),
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Relation" (
    "id" TEXT NOT NULL,
    "partyAId" TEXT NOT NULL,
    "partyBId" TEXT NOT NULL,
    "kind" "RelationKind" NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 1,
    "formedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Relation_partyAId_partyBId_kind_key" ON "Relation"("partyAId", "partyBId", "kind");

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_partyAId_fkey" FOREIGN KEY ("partyAId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_partyBId_fkey" FOREIGN KEY ("partyBId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
