-- AlterEnum
ALTER TYPE "PostCategory" ADD VALUE 'INPUTS';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "destinationDistrict" TEXT,
ADD COLUMN     "destinationProvince" TEXT,
ADD COLUMN     "travelDate" TIMESTAMP(3);
