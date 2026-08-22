CREATE TABLE "AgreementCancellation" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "termsId" TEXT NOT NULL,
  "cancelledById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgreementCancellation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgreementCancellation_matchId_key" ON "AgreementCancellation"("matchId");
CREATE INDEX "AgreementCancellation_termsId_idx" ON "AgreementCancellation"("termsId");
CREATE INDEX "AgreementCancellation_cancelledById_idx" ON "AgreementCancellation"("cancelledById");

ALTER TABLE "AgreementCancellation" ADD CONSTRAINT "AgreementCancellation_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgreementCancellation" ADD CONSTRAINT "AgreementCancellation_termsId_fkey"
  FOREIGN KEY ("termsId") REFERENCES "AgreementTerms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgreementCancellation" ADD CONSTRAINT "AgreementCancellation_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
