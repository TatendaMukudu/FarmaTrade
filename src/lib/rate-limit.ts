// A fixed-window limiter, in-process. Deliberately not Redis-backed: Render's
// free plan runs a single instance, so an in-memory Map already gives every
// request the same view, and it's zero extra infrastructure to reach for
// before there's a second instance to make it wrong. The map is process-
// lifetime only — a restart clears every count, which only ever helps an
// attacker, never a legitimate user.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Cheap, no-dependency eviction so long-running processes don't accumulate
// one entry per distinct key forever: swept opportunistically rather than on
// a timer, so it costs nothing when the app is idle.
let checksSinceSweep = 0;
const SWEEP_EVERY = 500;

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

// `limit` requests per `windowMs`, per `key`. Callers pick the key (an
// email for login, an IP for signup) so the same limiter serves different
// abuse shapes without becoming a bigger abstraction than it needs to be.
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (++checksSinceSweep >= SWEEP_EVERY) {
    checksSinceSweep = 0;
    sweep(now);
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Called on a successful login so a legitimate user's next attempt isn't
// still counted against the window a mistyped password or two used up.
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
