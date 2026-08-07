// Integration test for the contact-detail gate against a real Postgres.
//
// This is the control standing between one throwaway signup and every phone
// number on the platform, so it's tested against real match rows rather
// than a mocked predicate — the rule is "is there an accepted match", and
// that only means anything if the query behind it is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeCookies, resetNextRuntime } from "@/test/next-runtime-stub";
import {
  createTestParty,
  createTestPost,
  createTestMatch,
  cleanupParties,
} from "@/test/factories";

vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies,
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { visibleContactFor } = await import("@/lib/contact-visibility");
const { prisma } = await import("@/lib/prisma");

async function partyWithContact(phone: string) {
  const created = await createTestParty();
  const party = await prisma.party.update({
    where: { id: created.party.id },
    data: { phone, contactDetails: "Ask for the manager" },
  });
  return { ...created, party };
}

describe("contact visibility", () => {
  const partyIds: string[] = [];
  beforeEach(() => resetNextRuntime());
  afterEach(async () => {
    await cleanupParties(partyIds.splice(0));
  });

  it("withholds contact details from a stranger", async () => {
    const viewer = await createTestParty();
    const subject = await partyWithContact("+263771111111");
    partyIds.push(viewer.party.id, subject.party.id);

    const contact = await visibleContactFor(viewer.party, subject.party);
    expect(contact.visible).toBe(false);
    // The number must not appear anywhere in the returned object, not just
    // be hidden by the component that renders it.
    expect(JSON.stringify(contact)).not.toContain("+263771111111");
  });

  it("still withholds them on a merely SUGGESTED match", async () => {
    // A suggestion is the platform's opinion, not a relationship either
    // side agreed to. If this unlocked contact details, anyone could post a
    // matching listing and harvest whoever it paired them with.
    const viewer = await createTestParty({ province: "Harare", district: "Harare" });
    const subject = await partyWithContact("+263772222222");
    partyIds.push(viewer.party.id, subject.party.id);

    const theirs = await createTestPost(subject.party.id, { objective: "SELL" });
    const mine = await createTestPost(viewer.party.id, { objective: "BUY" });
    await createTestMatch(theirs.id, mine.id, "SUGGESTED");

    const contact = await visibleContactFor(viewer.party, subject.party);
    expect(contact.visible).toBe(false);
  });

  it("reveals them once a match between the two is accepted", async () => {
    const viewer = await createTestParty({ province: "Harare", district: "Harare" });
    const subject = await partyWithContact("+263773333333");
    partyIds.push(viewer.party.id, subject.party.id);

    const theirs = await createTestPost(subject.party.id, { objective: "SELL" });
    const mine = await createTestPost(viewer.party.id, { objective: "BUY" });
    await createTestMatch(theirs.id, mine.id, "ACCEPTED");

    const contact = await visibleContactFor(viewer.party, subject.party);
    expect(contact.visible).toBe(true);
    if (contact.visible) {
      expect(contact.phone).toBe("+263773333333");
      expect(contact.contactDetails).toBe("Ask for the manager");
    }
  });

  it("does not leak via a third party's accepted match", async () => {
    // The IDOR-shaped version of the bug: A and B have a deal, C has
    // nothing to do with either, and C must not inherit B's number just
    // because B has an accepted match with somebody.
    const buyer = await createTestParty({ province: "Harare", district: "Harare" });
    const subject = await partyWithContact("+263774444444");
    const outsider = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(buyer.party.id, subject.party.id, outsider.party.id);

    const theirs = await createTestPost(subject.party.id, { objective: "SELL" });
    const mine = await createTestPost(buyer.party.id, { objective: "BUY" });
    await createTestMatch(theirs.id, mine.id, "ACCEPTED");

    expect((await visibleContactFor(buyer.party, subject.party)).visible).toBe(true);
    expect((await visibleContactFor(outsider.party, subject.party)).visible).toBe(false);
  });

  it("always shows a party their own details", async () => {
    const self = await partyWithContact("+263775555555");
    partyIds.push(self.party.id);

    const contact = await visibleContactFor(self.party, self.party);
    expect(contact.visible).toBe(true);
  });

  it("records an audit event when one party's number reaches another", async () => {
    const viewer = await createTestParty({ province: "Harare", district: "Harare" });
    const subject = await partyWithContact("+263776666666");
    partyIds.push(viewer.party.id, subject.party.id);

    const theirs = await createTestPost(subject.party.id, { objective: "SELL" });
    const mine = await createTestPost(viewer.party.id, { objective: "BUY" });
    await createTestMatch(theirs.id, mine.id, "ACCEPTED");

    await visibleContactFor(viewer.party, subject.party);

    const events = await prisma.auditEvent.findMany({
      where: { action: "CONTACT_REVEALED", partyId: viewer.party.id },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].subjectId).toBe(subject.party.id);

    await prisma.auditEvent.deleteMany({ where: { partyId: viewer.party.id } });
  });
});
