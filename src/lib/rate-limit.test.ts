// Integration test: the limiter now lives in Postgres, so this exercises
// the real SQL rather than a Map. That's the point of the change — the
// properties worth proving (a count that survives a restart, and one that
// doesn't lose increments under concurrency) only exist in the database.
import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit, sweepRateLimits } from "./rate-limit";
import { prisma } from "@/lib/prisma";

const keys: string[] = [];
function testKey(name: string) {
  const key = `vitest:${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  keys.push(key);
  return key;
}

afterEach(async () => {
  const toDelete = keys.splice(0);
  if (toDelete.length) await prisma.rateLimit.deleteMany({ where: { key: { in: toDelete } } });
});

describe("checkRateLimit", () => {
  it("allows up to the limit and blocks the request after it", async () => {
    const key = testKey("basic");
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(key, 3, 60_000)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps separate counts per key", async () => {
    const a = testKey("sep-a");
    const b = testKey("sep-b");
    await checkRateLimit(a, 1, 60_000);
    expect((await checkRateLimit(a, 1, 60_000)).allowed).toBe(false);
    expect((await checkRateLimit(b, 1, 60_000)).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", async () => {
    const key = testKey("expiry");
    // A window already in the past: the next call should reset rather than
    // keep counting, and it should do so in the same statement.
    await prisma.rateLimit.create({
      data: { key, count: 99, resetAt: new Date(Date.now() - 1000) },
    });
    expect((await checkRateLimit(key, 3, 60_000)).allowed).toBe(true);
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    expect(row!.count).toBe(1);
    expect(row!.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("loses no increments when requests land simultaneously", async () => {
    // The property a read-then-write limiter cannot hold: ten concurrent
    // requests must count as ten, not as "they all read 0 and all passed".
    // Concurrency is exactly what an attacker generates, so this is the
    // case that matters most.
    const key = testKey("concurrent");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit(key, 4, 60_000)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect(results.filter((r) => !r.allowed)).toHaveLength(6);

    const row = await prisma.rateLimit.findUnique({ where: { key } });
    expect(row!.count).toBe(10);
  });

  it("survives a process restart — the count is not in process memory", async () => {
    const key = testKey("persistent");
    for (let i = 0; i < 5; i++) await checkRateLimit(key, 5, 60_000);
    // Reading the row directly is what a freshly-booted instance would see.
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    expect(row!.count).toBe(5);
    expect((await checkRateLimit(key, 5, 60_000)).allowed).toBe(false);
  });
});

describe("resetRateLimit", () => {
  it("clears the count so a successful login isn't penalised for earlier typos", async () => {
    const key = testKey("reset");
    await checkRateLimit(key, 1, 60_000);
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(false);

    await resetRateLimit(key);
    expect((await checkRateLimit(key, 1, 60_000)).allowed).toBe(true);
  });

  it("is harmless for a key that was never used", async () => {
    await expect(resetRateLimit(testKey("never-used"))).resolves.toBeUndefined();
  });
});

describe("sweepRateLimits", () => {
  it("removes expired rows and leaves live ones alone", async () => {
    const expired = testKey("sweep-expired");
    const live = testKey("sweep-live");
    await prisma.rateLimit.create({
      data: { key: expired, count: 1, resetAt: new Date(Date.now() - 60_000) },
    });
    await checkRateLimit(live, 5, 60_000);

    await sweepRateLimits();

    expect(await prisma.rateLimit.findUnique({ where: { key: expired } })).toBeNull();
    expect(await prisma.rateLimit.findUnique({ where: { key: live } })).not.toBeNull();
  });
});
