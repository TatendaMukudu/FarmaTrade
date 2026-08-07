import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AuditAction } from "@/generated/prisma/enums";

// Append-only record of security-relevant actions.
//
// A marketplace runs on disputes — "I never agreed to that price", "someone
// else got into my account", "this buyer has done this to four people".
// Without a record of who did what and when, every one of those is one
// person's word against another's, and the operator has nothing to review.
//
// Distinct from MemoryEvent on purpose: that's a farmer's own business
// history, written for them and read back to them as anticipations. This is
// a security record, written for the operator, and nothing in the product
// surfaces it to the party it's about.

type AuditInput = {
  action: AuditAction;
  partyId?: string | null;
  subjectId?: string | null;
  detail?: string;
};

// Coarse by design. Enough to notice "this account was used from three
// networks in an hour", not enough to be a tracking profile — and the
// user-agent is truncated because the full string is a fingerprint with no
// extra investigative value.
async function requestContext() {
  try {
    const hdrs = await headers();
    const forwarded = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ip: forwarded || hdrs.get("x-real-ip") || null,
      userAgent: hdrs.get("user-agent")?.slice(0, 200) ?? null,
    };
  } catch {
    // Outside a request (a cron job, a script, a test) there are no headers
    // to read — the event is still worth recording without them.
    return { ip: null, userAgent: null };
  }
}

// Never throws. An audit write failing must not take down the action it was
// observing: a farmer should not be unable to log in because the audit
// table is having a bad day. The failure goes to the logger instead, where
// it's still visible.
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        partyId: input.partyId ?? null,
        subjectId: input.subjectId ?? null,
        detail: input.detail ?? null,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    logger.error("audit.write_failed", {
      action: input.action,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
