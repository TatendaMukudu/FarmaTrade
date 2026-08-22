-- Bilateral agreement: consent becomes a row per party per terms version.
--
-- Expand-only, and no backfill of consent. Existing ACCEPTED matches were
-- reached by one party acting alone, so there is nothing in the data that
-- proves the counterparty agreed to anything. Writing them into the new
-- AGREED state would be fabricating that proof, so they are left exactly
-- where they are: the ACCEPTED value survives as a legacy marker, and rows
-- carrying it reserve no capacity until both parties agree properly.
--
-- COMPLETED matches are untouched and keep reserving their Match.quantity.
-- Two TransactionConfirmations exist on each, which is real evidence that
-- both parties acted, so grandfathering those is reading the record rather
-- than inventing one.

-- New enum values. Added, never renamed: an existing row's status must not
-- change meaning underneath a running process mid-deploy.
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'NEGOTIATING';
ALTER TYPE "MatchStatus" ADD VALUE IF NOT EXISTS 'AGREED';

CREATE TABLE "AgreementTerms" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "price" DECIMAL(12,2),
    "handoverOn" TIMESTAMP(3),
    "proposedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementTerms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- One terms row per version per match, so two concurrent proposals cannot
-- both claim to be version 3.
CREATE UNIQUE INDEX "AgreementTerms_matchId_version_key" ON "AgreementTerms"("matchId", "version");
CREATE INDEX "AgreementTerms_matchId_idx" ON "AgreementTerms"("matchId");
CREATE INDEX "AgreementTerms_proposedById_idx" ON "AgreementTerms"("proposedById");

-- One acceptance per party per version. A party cannot accept the same
-- terms twice, and nothing can overwrite consent already given.
CREATE UNIQUE INDEX "TermsAcceptance_termsId_partyId_key" ON "TermsAcceptance"("termsId", "partyId");
CREATE INDEX "TermsAcceptance_partyId_idx" ON "TermsAcceptance"("partyId");

ALTER TABLE "AgreementTerms" ADD CONSTRAINT "AgreementTerms_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgreementTerms" ADD CONSTRAINT "AgreementTerms_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "AgreementTerms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
