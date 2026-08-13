// Shared arrange-step helpers for Server Action integration tests. These
// call Prisma directly rather than going through the signup action, so a
// test for e.g. confirmMatch isn't also implicitly a test of signup — each
// integration test exercises exactly the one action it names, and uses
// these only to set up the surrounding state that action expects to exist.
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import type { PartyRole } from "@/generated/prisma/client";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTestParty(
  opts: {
    roles?: PartyRole[];
    countryCode?: string;
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
      roles: opts.roles ?? ["TRADER"],
      countryCode: opts.countryCode ?? "ZW",
      province: opts.province ?? "Harare",
      district: opts.district ?? "Harare",
    },
  });
  await prisma.reputation.create({ data: { partyId: party.id } });
  return { user, party, email, password };
}

export async function createTestIntent(
  partyId: string,
  overrides: Partial<{
    side: "SUPPLY" | "DEMAND";
    category: "PRODUCE" | "LIVESTOCK" | "EQUIPMENT" | "TRANSPORT" | "INPUTS";
    title: string;
    countryCode: string;
    productId: string | null;
    province: string;
    district: string;
    openToCrossBorder: boolean;
    status: "ACTIVE" | "PROPOSED" | "ENGAGED" | "WITHDRAWN";
    quantity: number | null;
    unit: string | null;
  }> = {},
) {
  return prisma.intent.create({
    data: {
      partyId,
      side: overrides.side ?? "SUPPLY",
      category: overrides.category ?? "PRODUCE",
      title: overrides.title ?? unique("Test post"),
      countryCode: overrides.countryCode ?? "ZW",
      productId: overrides.productId ?? null,
      province: overrides.province ?? "Harare",
      district: overrides.district ?? "Harare",
      openToCrossBorder: overrides.openToCrossBorder ?? false,
      status: overrides.status ?? "ACTIVE",
      quantity: overrides.quantity ?? null,
      unit: overrides.unit ?? null,
    },
  });
}

export async function createTestMatch(intentAId: string, intentBId: string, status: "SUGGESTED" | "ACCEPTED" = "ACCEPTED") {
  return prisma.match.create({
    data: { intentAId, intentBId, score: 80, reasons: ["test fixture"], status },
  });
}

// Deletes everything hanging off a set of test parties, in FK-safe order.
// Integration tests call this in `afterEach` rather than leaving fixtures
// in the shared dev/CI database indefinitely.
export async function cleanupParties(partyIds: string[]) {
  if (partyIds.length === 0) return;

  const intents = await prisma.intent.findMany({ where: { partyId: { in: partyIds } }, select: { id: true } });
  const intentIds = intents.map((p) => p.id);

  const matches = intentIds.length
    ? await prisma.match.findMany({
        where: { OR: [{ intentAId: { in: intentIds } }, { intentBId: { in: intentIds } }] },
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
  await prisma.photo.deleteMany({ where: { intentId: { in: intentIds } } });
  await prisma.intent.deleteMany({ where: { partyId: { in: partyIds } } });
  await prisma.relation.deleteMany({ where: { OR: [{ partyAId: { in: partyIds } }, { partyBId: { in: partyIds } }] } });
  await prisma.reputation.deleteMany({ where: { partyId: { in: partyIds } } });
  // Farm facets and their inventory. Deleted after intents, because an
  // intent may reference a produce/livestock/equipment row.
  const farms = await prisma.farm.findMany({
    where: { partyId: { in: partyIds } },
    select: { id: true },
  });
  const farmIds = farms.map((f) => f.id);
  if (farmIds.length) {
    await prisma.produceStock.deleteMany({ where: { farmId: { in: farmIds } } });
    await prisma.livestock.deleteMany({ where: { farmId: { in: farmIds } } });
    await prisma.equipment.deleteMany({ where: { farmId: { in: farmIds } } });
    await prisma.farm.deleteMany({ where: { id: { in: farmIds } } });
  }
  await prisma.transportProfile.deleteMany({ where: { partyId: { in: partyIds } } });
  const parties = await prisma.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, userId: true } });
  const userIds = parties.map((p) => p.userId).filter((id): id is string => id !== null);
  await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
