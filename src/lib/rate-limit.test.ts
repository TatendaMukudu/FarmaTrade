import { describe, expect, it, beforeEach, vi } from "vitest";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks once the limit is reached within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    const result = checkRateLimit(key, 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(keyA, 5, 60_000);
    expect(checkRateLimit(keyA, 5, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 5, 60_000).allowed).toBe(true);
  });

  it("allows requests again once the window rolls over", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000);
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("resetRateLimit clears a key's count immediately", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5, 60_000);
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(false);

    resetRateLimit(key);
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
  });
});
