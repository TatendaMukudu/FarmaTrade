import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { roleOutcomesFor, roleOutcomesForMany } from "@/lib/role-reputation";
import { roleRecordLine } from "@/lib/reputation-core";
import {
  cleanupParties,
  createTestIntent,
  createTestMatch,
  createTestParty,
} from "@/test/factories";

// INV-10. One actor, two records. The point of these cases is that a party's
// failures in one role must never appear in the other — the flatten that made
// a strong supplier look weak because they are a poor buyer.
describe("role-scoped outcomes", () => {
  const partyIds: string[] = [];
  afterEach(async () => cleanupParties(partyIds.splice(0)));

  async function actor() {
    const created = await createTestParty({ province: "Harare", district: "Harare" });
    partyIds.push(created.party.id);
    return created.party;
  }

  // Records one settled trade where `subject` played `side`, with `outcome`.
  async function trade(
    subject: { id: string },
    counterparty: { id: string },
    side: "SUPPLY" | "DEMAND",
    outcome: "COMPLETED_GOOD" | "COMPLETED_ISSUE" | "DID_NOT_HAPPEN",
  ) {
    const mine = await createTestIntent(subject.id, { side, category: "PRODUCE" });
    const theirs = await createTestIntent(counterparty.id, {
      side: side === "SUPPLY" ? "DEMAND" : "SUPPLY",
      category: "PRODUCE",
    });
    const match = await createTestMatch(mine.id, theirs.id, "ACCEPTED");
    await prisma.transactionConfirmation.create({
      data: { matchId: match.id, partyId: subject.id, outcome },
    });
  }

  it("keeps a supplier's record apart from the same actor's buying record", async () => {
    const subject = await actor();
    const other = await actor();

    await trade(subject, other, "SUPPLY", "COMPLETED_GOOD");
    await trade(subject, other, "SUPPLY", "COMPLETED_GOOD");
    await trade(subject, other, "DEMAND", "DID_NOT_HAPPEN");

    const record = await roleOutcomesFor(subject.id);

    expect(record.SUPPLIER.completed).toBe(2);
    expect(record.SUPPLIER.didNotHappen).toBe(0);
    expect(record.BUYER.completed).toBe(0);
    expect(record.BUYER.didNotHappen).toBe(1);
  });

  it("does not let a buying failure touch the supplying record", async () => {
    const subject = await actor();
    const other = await actor();

    await trade(subject, other, "SUPPLY", "COMPLETED_GOOD");
    await trade(subject, other, "DEMAND", "DID_NOT_HAPPEN");
    await trade(subject, other, "DEMAND", "DID_NOT_HAPPEN");

    const record = await roleOutcomesFor(subject.id);

    // This is the exact misreading the flat aggregate produced: three
    // confirmations, two failures, one completed — read as "unreliable".
    // As a supplier they are one for one.
    expect(record.SUPPLIER).toMatchObject({ completed: 1, didNotHappen: 0 });
    expect(record.BUYER).toMatchObject({ completed: 0, didNotHappen: 2 });
  });

  it("counts a trade that happened badly as a trade that happened", async () => {
    const subject = await actor();
    const other = await actor();
    await trade(subject, other, "SUPPLY", "COMPLETED_ISSUE");

    const record = await roleOutcomesFor(subject.id);
    expect(record.SUPPLIER.completed).toBe(1);
    expect(record.SUPPLIER.completedIssue).toBe(1);
    expect(record.SUPPLIER.didNotHappen).toBe(0);
  });

  it("reports an actor with no history truthfully rather than as a zero score", async () => {
    const subject = await actor();
    const record = await roleOutcomesFor(subject.id);

    expect(record.SUPPLIER.completed).toBe(0);
    expect(roleRecordLine("SUPPLIER", record.SUPPLIER)).toBe("No completed trades supplying yet");
    expect(roleRecordLine("SUPPLIER", record.SUPPLIER)).not.toMatch(/\b0(\.0)?\b\s*(star|rating|%)/i);
  });

  it("derives the same answer in batch as one at a time", async () => {
    const a = await actor();
    const b = await actor();
    await trade(a, b, "SUPPLY", "COMPLETED_GOOD");
    await trade(b, a, "SUPPLY", "DID_NOT_HAPPEN");

    const batch = await roleOutcomesForMany([a.id, b.id]);
    expect(batch.get(a.id)).toEqual(await roleOutcomesFor(a.id));
    expect(batch.get(b.id)).toEqual(await roleOutcomesFor(b.id));
  });

  it("returns an empty record for a party nobody has traded with", async () => {
    const subject = await actor();
    const batch = await roleOutcomesForMany([subject.id]);
    expect(batch.get(subject.id)).toEqual({
      SUPPLIER: { completedGood: 0, completedIssue: 0, didNotHappen: 0, completed: 0 },
      BUYER: { completedGood: 0, completedIssue: 0, didNotHappen: 0, completed: 0 },
    });
  });
});
