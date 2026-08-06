-- CreateIndex
CREATE INDEX "Equipment_farmId_idx" ON "Equipment"("farmId");

-- CreateIndex
CREATE INDEX "Livestock_farmId_idx" ON "Livestock"("farmId");

-- CreateIndex
CREATE INDEX "Match_postBId_idx" ON "Match"("postBId");

-- CreateIndex
CREATE INDEX "Post_partyId_idx" ON "Post"("partyId");

-- CreateIndex
CREATE INDEX "Post_produceId_idx" ON "Post"("produceId");

-- CreateIndex
CREATE INDEX "ProduceStock_farmId_idx" ON "ProduceStock"("farmId");

-- CreateIndex
CREATE INDEX "Rating_subjectId_idx" ON "Rating"("subjectId");

-- CreateIndex
CREATE INDEX "Relation_partyBId_idx" ON "Relation"("partyBId");

-- CreateIndex
CREATE INDEX "TransactionConfirmation_partyId_idx" ON "TransactionConfirmation"("partyId");
