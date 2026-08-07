-- DropForeignKey
ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_matchId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_fkey";

-- DropForeignKey
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_postId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionConfirmation" DROP CONSTRAINT "TransactionConfirmation_matchId_fkey";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Message_authorId_idx" ON "Message"("authorId");

-- CreateIndex
CREATE INDEX "Post_livestockId_idx" ON "Post"("livestockId");

-- CreateIndex
CREATE INDEX "Post_equipmentId_idx" ON "Post"("equipmentId");

-- CreateIndex
CREATE INDEX "Rating_authorId_idx" ON "Rating"("authorId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionConfirmation" ADD CONSTRAINT "TransactionConfirmation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
