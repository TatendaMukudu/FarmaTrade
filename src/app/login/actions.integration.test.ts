// Integration test: exercises the real loginAction — credential
// verification, session cookie creation, and rate limiting — against a
// real Postgres and a real bcrypt hash (via the createTestParty factory,
// which itself calls the app's own hashPassword).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, RedirectSignal, resetNextRuntime } from "@/test/next-runtime-stub";
import { createTestParty, cleanupParties } from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { loginAction } = await import("./actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("loginAction", () => {
  const partyIds: string[] = [];

  beforeEach(() => {
    resetNextRuntime();
  });

  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("logs in with the correct password and sets a session cookie", async () => {
    const { party, email, password } = await createTestParty();
    partyIds.push(party.id);

    await expect(loginAction({}, formData({ email, password }))).rejects.toThrow(RedirectSignal);
    expect(fakeCookies.get("farmatrade_session")).toBeDefined();
  });

  it("rejects the wrong password without setting a session cookie", async () => {
    const { party, email } = await createTestParty();
    partyIds.push(party.id);

    const result = await loginAction({}, formData({ email, password: "wrong-password" }));
    expect(result.error).toMatch(/invalid email or password/i);
    expect(fakeCookies.get("farmatrade_session")).toBeUndefined();
  });

  it("rejects an email that doesn't exist with the same generic message", async () => {
    const result = await loginAction(
      {},
      formData({ email: "no-such-account@example.test", password: "whatever123" }),
    );
    expect(result.error).toMatch(/invalid email or password/i);
  });

  it("blocks after 5 failed attempts for the same email and allows a fresh email through", async () => {
    const { party, email } = await createTestParty();
    partyIds.push(party.id);

    for (let i = 0; i < 5; i++) {
      const result = await loginAction({}, formData({ email, password: "wrong-password" }));
      expect(result.error).toMatch(/invalid email or password/i);
    }

    const blocked = await loginAction({}, formData({ email, password: "wrong-password" }));
    expect(blocked.error).toMatch(/too many attempts/i);

    const other = await createTestParty();
    partyIds.push(other.party.id);
    const otherResult = await loginAction({}, formData({ email: other.email, password: "wrong-password" }));
    expect(otherResult.error).toMatch(/invalid email or password/i);
  });

  it("a successful login clears the failed-attempt count for that email", async () => {
    const { party, email, password } = await createTestParty();
    partyIds.push(party.id);

    for (let i = 0; i < 4; i++) {
      await loginAction({}, formData({ email, password: "wrong-password" }));
    }

    await expect(loginAction({}, formData({ email, password }))).rejects.toThrow(RedirectSignal);

    resetNextRuntime();
    await expect(loginAction({}, formData({ email, password }))).rejects.toThrow(RedirectSignal);
  });
});
