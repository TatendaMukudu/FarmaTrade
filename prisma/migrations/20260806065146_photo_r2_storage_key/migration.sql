-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;
