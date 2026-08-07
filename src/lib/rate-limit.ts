import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";

// Fixed-window limiter, in Postgres.
//
// The in-memory Map this replaces had two holes that only look small until
// somebody leans on them:
//
//   1. Every deploy reset every counter. An attacker mid-way through a
//      credential-stuffing run just waits for the next release and starts
//      again at zero — and a busy project ships often.
//   2. A second instance would give each its own private view of "5
//      attempts", so the real limit silently becomes 5 x instances. That
//      breaks precisely when traffic grows enough to need a second box,
//      i.e. exactly when the limiter starts to matter.
//
// The counter now lives where every instance and every deploy can see the
// same one. The cost is one indexed upsert on the auth path, which is far
// cheaper than the bcrypt comparison already happening there.

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

// Increments and tests in a single statement. Doing this as read-then-write
// would let two simultaneous requests both read count=4 and both proceed —
// the classic way a "5 attempts" limit quietly becomes unbounded under the
// concurrency an attacker is by definition generating.
//
// `resetAt <= now` inside the statement resets an expired window in the
// same round trip, so an expired row never needs a separate delete.
const CONSUME = Prisma.sql`
  INSERT INTO "RateLimit" ("key", "count", "resetAt", "updatedAt")
  VALUES ($1, 1, $2, NOW())
  ON CONFLICT ("key") DO UPDATE SET
    "count"   = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
    "resetAt" = CASE WHEN "RateLimit"."resetAt" <= NOW() THEN $2 ELSE "RateLimit"."resetAt" END,
    "updatedAt" = NOW()
  RETURNING "count", "resetAt"
`;

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const resetAt = new Date(Date.now() + windowMs);

  try {
    const rows = await prisma.$queryRawUnsafe<{ count: number; resetAt: Date }[]>(
      CONSUME.sql,
      key,
      resetAt,
    );
    const row = rows[0];
    if (!row) return { allowed: true, retryAfterMs: 0 };

    if (row.count > limit) {
      return { allowed: false, retryAfterMs: Math.max(0, row.resetAt.getTime() - Date.now()) };
    }
    return { allowed: true, retryAfterMs: 0 };
  } catch (err) {
    // Fail open, loudly. A database blip must not lock every user out of
    // logging in — the limiter is a brake on abuse, not an authentication
    // control, and treating it as one turns a transient DB error into a
    // total outage. The log line is what makes this visible rather than
    // silently permanent.
    logger.error("rate_limit.check_failed", {
      key,
      message: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, retryAfterMs: 0 };
  }
}

// Called after a successful login so a legitimate user's next attempt isn't
// still counted against a window that a mistyped password or two used up.
export async function resetRateLimit(key: string) {
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch (err) {
    logger.error("rate_limit.reset_failed", {
      key,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// Expired rows are harmless but accumulate one per distinct key forever.
// Called from the scheduled signals job rather than on a timer, so an idle
// app does no work.
export async function sweepRateLimits() {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { resetAt: { lt: new Date() } },
  });
  return count;
}
