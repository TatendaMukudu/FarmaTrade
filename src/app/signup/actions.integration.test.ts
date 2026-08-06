// Integration test: exercises the real signupAction — including its Zod
// validation, the transactional User+Party+Farm/TransportProfile+Reputation
// write, rate limiting, and the createSession + redirect at the end —
// against a real Postgres. cookies/headers/redirect/revalidatePath don't
// exist outside an actual request, so they're mocked via the shared
// next-runtime-stub rather than each test inventing its own fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeCookies,
  fakeRequestHeaders,
  RedirectSignal,
  resetNextRuntime,
} from "@/test/next-runtime-stub";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({
    get: (key: string) => fakeRequestHeaders.get(key.toLowerCase()) ?? null,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { signupAction } = await import("./actions");
const { prisma } = await import("@/lib/prisma");

function formData(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      value.forEach((v) => fd.append(key, v));
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

function uniqueEmail() {
  return `signup-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

describe("signupAction", () => {
  const createdEmails: string[] = [];

  beforeEach(() => {
    resetNextRuntime();
  });

  afterEach(async () => {
    const emails = createdEmails.splice(0);
    if (emails.length === 0) return;
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    const parties = await prisma.party.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const partyIds = parties.map((p) => p.id);
    await prisma.farm.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.transportProfile.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.reputation.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("creates a User, Party, and Reputation, then redirects to the dashboard", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const fd = formData({
      name: "Tendai Farmer",
      email,
      password: "password123",
      province: "Mashonaland East",
      district: "Marondera",
      roles: ["TRADER"],
    });

    await expect(signupAction({}, fd)).rejects.toThrow(RedirectSignal);

    const user = await prisma.user.findUnique({ where: { email }, include: { party: { include: { reputation: true } } } });
    expect(user).not.toBeNull();
    expect(user!.party?.roles).toEqual(["TRADER"]);
    expect(user!.party?.reputation).not.toBeNull();
  });

  it("also creates a Farm when the FARM role and farmName are given", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const fd = formData({
      name: "Farm Owner",
      email,
      password: "password123",
      province: "Mashonaland East",
      district: "Marondera",
      roles: ["FARM"],
      farmName: "Green Acres",
    });

    await expect(signupAction({}, fd)).rejects.toThrow(RedirectSignal);

    const user = await prisma.user.findUnique({ where: { email }, include: { party: { include: { farm: true } } } });
    expect(user!.party?.farm?.farmName).toBe("Green Acres");
  });

  it("sets the session cookie before redirecting", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const fd = formData({
      name: "Cookie Check",
      email,
      password: "password123",
      province: "Harare",
      district: "Harare",
      roles: ["TRADER"],
    });

    await expect(signupAction({}, fd)).rejects.toThrow(RedirectSignal);
    expect(fakeCookies.get("farmatrade_session")).toBeDefined();
  });

  it("rejects a duplicate email without creating a second account", async () => {
    const email = uniqueEmail();
    createdEmails.push(email);

    const fd = () =>
      formData({
        name: "Dup Test",
        email,
        password: "password123",
        province: "Harare",
        district: "Harare",
        roles: ["TRADER"],
      });

    await expect(signupAction({}, fd())).rejects.toThrow(RedirectSignal);

    const result = await signupAction({}, fd());
    expect(result.error).toMatch(/already exists/i);

    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(1);
  });

  it("rejects invalid input via the Zod schema without touching the database", async () => {
    const email = uniqueEmail();
    const fd = formData({
      name: "",
      email,
      password: "short",
      province: "Harare",
      district: "Harare",
      roles: ["TRADER"],
    });

    const result = await signupAction({}, fd);
    expect(result.error).toBeDefined();

    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(0);
  });

  it("rate-limits repeated signups from the same IP", async () => {
    fakeRequestHeaders.set("x-forwarded-for", "203.0.113.7");

    for (let i = 0; i < 20; i++) {
      const email = uniqueEmail();
      createdEmails.push(email);
      const fd = formData({
        name: "Rate Test",
        email,
        password: "password123",
        province: "Harare",
        district: "Harare",
        roles: ["TRADER"],
      });
      await expect(signupAction({}, fd)).rejects.toThrow(RedirectSignal);
    }

    const email = uniqueEmail();
    const fd = formData({
      name: "Rate Test Overflow",
      email,
      password: "password123",
      province: "Harare",
      district: "Harare",
      roles: ["TRADER"],
    });
    const result = await signupAction({}, fd);
    expect(result.error).toMatch(/too many signups/i);

    const count = await prisma.user.count({ where: { email } });
    expect(count).toBe(0);
  });
});
