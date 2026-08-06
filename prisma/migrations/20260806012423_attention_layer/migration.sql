-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "opportunitiesLastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "recurring" BOOLEAN NOT NULL DEFAULT false;
