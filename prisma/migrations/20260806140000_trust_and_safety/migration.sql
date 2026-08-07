-- Trust & safety: blocks, reports, suspension, an append-only audit log, and
-- database-backed rate limiting (the in-memory limiter reset on every deploy
-- and gave each instance its own private view of the limit).

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SCAM', 'MISREPRESENTED_GOODS', 'NO_SHOW', 'ABUSIVE', 'SPAM', 'FAKE_ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'SIGNUP', 'PASSWORD_CHANGED', 'SESSIONS_REVOKED', 'CONTACT_REVEALED', 'PARTY_BLOCKED', 'PARTY_UNBLOCKED', 'REPORT_FILED', 'POST_DELETED', 'PROFILE_UPDATED');

-- AlterTable
ALTER TABLE "Party" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "PartyBlock" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "postId" TEXT,
    "matchId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "partyId" TEXT,
    "subjectId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PartyBlock_actorId_idx" ON "PartyBlock"("actorId");

-- CreateIndex
CREATE INDEX "PartyBlock_targetId_idx" ON "PartyBlock"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyBlock_actorId_targetId_key" ON "PartyBlock"("actorId", "targetId");

-- CreateIndex
CREATE INDEX "Report_subjectId_status_idx" ON "Report"("subjectId", "status");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_partyId_createdAt_idx" ON "AuditEvent"("partyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- AddForeignKey
ALTER TABLE "PartyBlock" ADD CONSTRAINT "PartyBlock_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyBlock" ADD CONSTRAINT "PartyBlock_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

