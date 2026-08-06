// Shared arrange-step helpers for Server Action integration tests. These
// call Prisma directly rather than going through the signup action, so a
// test for e.g. confirmMatch isn't also implicitly a test of signup — each
// integration test exercises exactly the one action it names, and uses
// these only to set up the surrounding state that action expects to exist.
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { objectiveSpec } from "@/lib/objectives";
import type { Capability, Objective, PostCategory, MemoryKind } from "@/generated/prisma/client";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTestParty(
  opts: {
    capabilities?: Capability[];
    province?: string;
    district?: string;
    password?: string;
  } = {},
) {
  const email = `${unique("test")}@example.test`;
  const password = opts.password ?? "testpassword123";
  const user = await prisma.user.create({
    data: {
      name: unique("Tester"),
      email,
      passwordHash: await hashPassword(password),
    },
  });
  const party = await prisma.party.create({
    data: {
      userId: user.id,
      name: user.name,
      capabilities: opts.capabilities ?? ["BUYER", "SUPPLIER"],
      province: opts.province ?? "Harare",
      district: opts.district ?? "Harare",
    },
  });
  await prisma.reputation.create({ data: { partyId: party.id } });
  return { user, party, email, password };
}

// `objective` is the real input; `type` is derived from it so a fixture can
// never declare a combination the app itself can't produce (a SELL post
// that claims to be a NEED, say), which would make a matching test pass
// against data the composer would never create.
export async function createTestPost(
  partyId: string,
  overrides: Partial<{
    objective: Objective;
    category: PostCategory;
    title: string;
    province: string;
    district: string;
    status: "OPEN" | "DRAFT" | "CLOSED";
    urgent: boolean;
    quantity: number;
  }> = {},
) {
  const objective = overrides.objective ?? "SELL";
  return prisma.post.create({
    data: {
      partyId,
      objective,
      type: objectiveSpec(objective).type,
      category: overrides.category ?? "PRODUCE",
      title: overrides.title ?? unique("Test post"),
      province: overrides.province ?? "Harare",
      district: overrides.district ?? "Harare",
      status: overrides.status ?? "OPEN",
      urgent: overrides.urgent ?? false,
      quantity: overrides.quantity,
    },
  });
}

export async function createTestMemoryEvent(
  partyId: string,
  event: {
    kind: MemoryKind;
    subject: string;
    occurredAt: Date;
    counterpartyId?: string;
    category?: PostCategory;
  },
) {
  return prisma.memoryEvent.create({
    data: {
      partyId,
      kind: event.kind,
      subject: event.subject,
      occurredAt: event.occurredAt,
      counterpartyId: event.counterpartyId ?? null,
      category: event.category ?? null,
    },
  });
}

export async function createTestMatch(postAId: string, postBId: string, status: "SUGGESTED" | "ACCEPTED" = "ACCEPTED") {
  return prisma.match.create({
    data: { postAId, postBId, score: 80, reasons: ["test fixture"], status },
  });
}

export async function createTestPhoto(postId: string, storageKey: string, mimeType = "image/jpeg") {
  return prisma.photo.create({ data: { postId, storageKey, mimeType } });
}

// Deletes everything hanging off a set of test parties, in FK-safe order.
// Integration tests call this in `afterEach` rather than leaving fixtures
// in the shared dev/CI database indefinitely.
export async function cleanupParties(partyIds: string[]) {
  if (partyIds.length === 0) return;

  const posts = await prisma.post.findMany({ where: { partyId: { in: partyIds } }, select: { id: true } });
  const postIds = posts.map((p) => p.id);

  const matches = postIds.length
    ? await prisma.match.findMany({
        where: { OR: [{ postAId: { in: postIds } }, { postBId: { in: postIds } }] },
        select: { id: true },
      })
    : [];
  const matchIds = matches.map((m) => m.id);

  if (matchIds.length) {
    await prisma.conversation.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.rating.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.transactionConfirmation.deleteMany({ where: { matchId: { in: matchIds } } });
    await prisma.match.deleteMany({ where: { id: { in: matchIds } } });
  }
  await prisma.rating.deleteMany({ where: { OR: [{ authorId: { in: partyIds } }, { subjectId: { in: partyIds } }] } });
  await prisma.photo.deleteMany({ where: { postId: { in: postIds } } });
  await prisma.post.deleteMany({ where: { partyId: { in: partyIds } } });
  await prisma.relation.deleteMany({ where: { OR: [{ partyAId: { in: partyIds } }, { partyBId: { in: partyIds } }] } });
  await prisma.reputation.deleteMany({ where: { partyId: { in: partyIds } } });
  const parties = await prisma.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, userId: true } });
  const userIds = parties.map((p) => p.userId).filter((id): id is string => id !== null);
  await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
