import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
// Safe to import here (unlike the read helpers in signals.ts, which are
// `server-only`): signals-compute.ts is the job entrypoint, built to run
// outside Next exactly like this seed does.
import { recomputeMarketSignals } from "../src/lib/signals-compute";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Override via SEED_PASSWORD for any non-local database — this file is
// committed to a public(ly visible) repo, so the fallback below should
// only ever be relied on for a local dev database.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "FarmaTrade2026!";

type Capability = "FARMER" | "BUYER" | "SUPPLIER" | "TRANSPORTER";

async function createAccount(opts: {
  email: string;
  name: string;
  phone: string;
  region: string;
  locality: string;
  capabilities: Capability[];
  passwordHash: string;
  verifiedBy?: "FOUNDER" | "NETWORK";
  farm?: { farmName: string; sizeHectares?: number };
  transport?: {
    vehicleType: "TRUCK" | "REFRIGERATED_TRUCK" | "PICKUP" | "TRAILER" | "OTHER";
    capacityKg?: number;
    serviceRegion?: string;
  };
}) {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: opts.name,
      phone: opts.phone,
      passwordHash: opts.passwordHash,
    },
  });

  const party = await prisma.party.create({
    data: {
      userId: user.id,
      name: opts.name,
      phone: opts.phone,
      region: opts.region,
      locality: opts.locality,
      capabilities: opts.capabilities,
      verifiedBy: opts.verifiedBy,
    },
  });

  let farm = null;
  if (opts.farm) {
    farm = await prisma.farm.create({
      data: { partyId: party.id, ...opts.farm },
    });
  }

  if (opts.transport) {
    await prisma.transportProfile.create({
      data: { partyId: party.id, ...opts.transport },
    });
  }

  await prisma.reputation.create({ data: { partyId: party.id } });

  return { user, party, farm };
}

async function recomputeReputation(partyId: string) {
  const [completedGoodCount, completedIssueCount, ratingAgg] = await Promise.all([
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_GOOD" },
    }),
    prisma.transactionConfirmation.count({
      where: { partyId, outcome: "COMPLETED_ISSUE" },
    }),
    prisma.rating.aggregate({
      where: { subjectId: partyId },
      _avg: { score: true },
      _count: { score: true },
    }),
  ]);

  await prisma.reputation.update({
    where: { partyId },
    data: {
      completedCount: completedGoodCount + completedIssueCount,
      completedGoodCount,
      completedIssueCount,
      averageRating: ratingAgg._avg.score,
      ratingCount: ratingAgg._count.score,
    },
  });
}

async function recomputeRelation(partyId1: string, partyId2: string) {
  const [partyAId, partyBId] = [partyId1, partyId2].sort();
  const completedCount = await prisma.match.count({
    where: {
      status: "COMPLETED",
      OR: [
        { postA: { partyId: partyAId }, postB: { partyId: partyBId } },
        { postA: { partyId: partyBId }, postB: { partyId: partyAId } },
      ],
    },
  });
  if (completedCount === 0) return;
  await prisma.relation.upsert({
    where: { partyAId_partyBId_kind: { partyAId, partyBId, kind: "PREFERRED_PARTNER" } },
    create: { partyAId, partyBId, kind: "PREFERRED_PARTNER", strength: completedCount },
    update: { strength: completedCount },
  });
}

async function main() {
  // This script wipes every table before reseeding. Once there's a
  // production database with real farmer data in it, that's not a demo
  // reset anymore, it's data loss — require an explicit opt-in rather than
  // let `npm run db:seed` run against it by accident (e.g. from a Render
  // shell against the same DATABASE_URL the app is using).
  if (process.env.NODE_ENV === "production" && process.env.SEED_CONFIRM !== "WIPE") {
    console.error(
      "Refusing to seed: NODE_ENV=production and SEED_CONFIRM=WIPE was not set.\n" +
        "This script deletes all existing data. If you really mean to wipe this\n" +
        "database, rerun with SEED_CONFIRM=WIPE set explicitly.",
    );
    process.exit(1);
  }

  console.log("Wiping existing data...");
  // Listed explicitly even though Party's cascade would take MemoryEvent
  // with it — this block is the readable inventory of what a reseed
  // destroys, and a table missing from it reads as a table that survives.
  await prisma.memoryEvent.deleteMany();
  await prisma.marketSignal.deleteMany();
  await prisma.relation.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.transactionConfirmation.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.match.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.post.deleteMany();
  await prisma.reputation.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.produceStock.deleteMany();
  await prisma.livestock.deleteMany();
  await prisma.transportProfile.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.party.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log("Creating accounts...");

  // --- Mashonaland West / Chinhoyi ---
  const tendai = await createAccount({
    email: "tendai@moyofarm.co.zw",
    name: "Tendai Moyo",
    phone: "+263771234001",
    region: "Mashonaland West",
    locality: "Chinhoyi",
    capabilities: ["FARMER"],
    passwordHash,
    verifiedBy: "FOUNDER",
    farm: { farmName: "Moyo Family Farm", sizeHectares: 45 },
  });
  await prisma.livestock.create({
    data: {
      farmId: tendai.farm!.id,
      species: "CATTLE",
      sex: "MALE",
      quantity: 3,
      breed: "Brahman",
      notes: "Breeding bulls, offloaded for genetic diversity swap",
    },
  });
  await prisma.livestock.create({
    data: {
      farmId: tendai.farm!.id,
      species: "CATTLE",
      sex: "MIXED",
      quantity: 12,
      notes: "Main herd",
    },
  });
  await prisma.equipment.create({
    data: {
      farmId: tendai.farm!.id,
      name: "Massey Ferguson 375 Tractor",
      category: "TRACTOR",
      condition: "Good",
      available: true,
    },
  });

  const tapiwa = await createAccount({
    email: "tapiwa@haulzw.co.zw",
    name: "Tapiwa Muzenda",
    phone: "+263771234002",
    region: "Mashonaland West",
    locality: "Chinhoyi",
    capabilities: ["TRANSPORTER"],
    passwordHash,
    transport: { vehicleType: "TRUCK", capacityKg: 7000, serviceRegion: "Mashonaland West" },
  });

  const grace = await createAccount({
    email: "grace@chikwanhatrading.co.zw",
    name: "Grace Chikwanha",
    phone: "+263771234003",
    region: "Mashonaland West",
    locality: "Chinhoyi",
    capabilities: ["BUYER", "SUPPLIER"],
    passwordHash,
    verifiedBy: "FOUNDER",
  });

  // --- Midlands / Gweru ---
  const blessing = await createAccount({
    email: "blessing@chikaufranch.co.zw",
    name: "Blessing Chikafu",
    phone: "+263771234004",
    region: "Midlands",
    locality: "Gweru",
    capabilities: ["FARMER"],
    passwordHash,
    verifiedBy: "NETWORK",
    farm: { farmName: "Chikafu Ranch", sizeHectares: 120 },
  });
  await prisma.livestock.create({
    data: {
      farmId: blessing.farm!.id,
      species: "CATTLE",
      sex: "MIXED",
      quantity: 40,
      notes: "Main herd",
    },
  });
  await prisma.equipment.create({
    data: {
      farmId: blessing.farm!.id,
      name: "Disc plough",
      category: "PLOUGH",
      condition: "Fair",
      available: true,
    },
  });

  const isaac = await createAccount({
    email: "isaac@moyanastores.co.zw",
    name: "Isaac Moyana",
    phone: "+263771234005",
    region: "Midlands",
    locality: "Gweru",
    capabilities: ["BUYER", "SUPPLIER"],
    passwordHash,
  });

  // --- Manicaland / Mutare ---
  const rudo = await createAccount({
    email: "rudo@sitholeorchards.co.zw",
    name: "Rudo Sithole",
    phone: "+263771234006",
    region: "Manicaland",
    locality: "Mutare",
    capabilities: ["FARMER"],
    passwordHash,
    farm: { farmName: "Sithole Orchards", sizeHectares: 18 },
  });
  await prisma.produceStock.create({
    data: {
      farmId: rudo.farm!.id,
      cropType: "Oranges",
      quantity: 3,
      unit: "TONNE",
      perishable: true,
      harvestDate: new Date(),
    },
  });
  await prisma.equipment.create({
    data: {
      farmId: rudo.farm!.id,
      name: "Drip irrigation kit",
      category: "IRRIGATION",
      condition: "Good",
      available: false,
      notes: "Currently in use on the orchard",
    },
  });

  const patricia = await createAccount({
    email: "patricia@zuluexports.co.zw",
    name: "Patricia Zulu",
    phone: "+263771234007",
    region: "Manicaland",
    locality: "Mutare",
    capabilities: ["BUYER", "SUPPLIER"],
    passwordHash,
  });

  const nyasha = await createAccount({
    email: "nyasha@coldchainzw.co.zw",
    name: "Nyasha Dube",
    phone: "+263771234008",
    region: "Manicaland",
    locality: "Mutare",
    capabilities: ["TRANSPORTER"],
    passwordHash,
    transport: {
      vehicleType: "REFRIGERATED_TRUCK",
      capacityKg: 4000,
      serviceRegion: "Manicaland",
    },
  });

  // --- Matabeleland South / Gwanda ---
  const farai = await createAccount({
    email: "farai@ncubefarms.co.zw",
    name: "Farai Ncube",
    phone: "+263771234009",
    region: "Matabeleland South",
    locality: "Gwanda",
    capabilities: ["FARMER"],
    passwordHash,
    farm: { farmName: "Ncube Farms", sizeHectares: 30 },
  });
  await prisma.livestock.create({
    data: {
      farmId: farai.farm!.id,
      species: "GOAT",
      sex: "MIXED",
      quantity: 25,
    },
  });
  await prisma.produceStock.create({
    data: {
      farmId: farai.farm!.id,
      cropType: "Maize",
      quantity: 10,
      unit: "BAG",
      perishable: false,
    },
  });

  console.log("Creating posts and matches...");

  // Live opportunity: Rudo's oranges <-> Patricia's export demand (Mutare)
  const orangesHave = await prisma.post.create({
    data: {
      partyId: rudo.party.id,
      objective: "SELL",
      type: "HAVE",
      category: "PRODUCE",
      title: "3 tonnes of oranges, need to move before they spoil",
      region: "Manicaland",
      locality: "Mutare",
      quantity: 3,
      unit: "TONNE",
      urgent: true,
    },
  });
  const orangesNeed = await prisma.post.create({
    data: {
      partyId: patricia.party.id,
      objective: "BUY",
      type: "NEED",
      category: "PRODUCE",
      title: "Oranges for export, any quantity",
      region: "Manicaland",
      locality: "Mutare",
    },
  });
  await prisma.match.create({
    data: {
      postAId: orangesHave.id,
      postBId: orangesNeed.id,
      score: 78,
      status: "SUGGESTED",
      reasons: ["same locality", "counterparty: new, no history yet", "time-sensitive"],
    },
  });

  // Live opportunity: Rudo needs refrigerated transport <-> Nyasha has it (Mutare)
  const transportNeed = await prisma.post.create({
    data: {
      partyId: rudo.party.id,
      objective: "TRANSPORT_NEED",
      type: "NEED",
      category: "TRANSPORT",
      title: "Refrigerated truck needed this week",
      region: "Manicaland",
      locality: "Mutare",
      urgent: true,
    },
  });
  const transportHave = await prisma.post.create({
    data: {
      partyId: nyasha.party.id,
      objective: "TRANSPORT_OFFER",
      type: "HAVE",
      category: "TRANSPORT",
      title: "Refrigerated truck, based in Mutare",
      region: "Manicaland",
      locality: "Mutare",
    },
  });
  await prisma.match.create({
    data: {
      postAId: transportNeed.id,
      postBId: transportHave.id,
      score: 82,
      status: "SUGGESTED",
      reasons: ["same locality", "counterparty: new, no history yet", "time-sensitive"],
    },
  });

  // Open posts with no live match yet — realistic "waiting" state
  await prisma.post.create({
    data: {
      partyId: tendai.party.id,
      objective: "RENT_OUT",
      type: "HAVE",
      category: "EQUIPMENT",
      title: "Idle tractor, available most of the season",
      region: "Mashonaland West",
      locality: "Chinhoyi",
    },
  });
  await prisma.post.create({
    data: {
      partyId: tapiwa.party.id,
      objective: "TRANSPORT_OFFER",
      type: "HAVE",
      category: "TRANSPORT",
      title: "7-tonne truck available for local hauls",
      region: "Mashonaland West",
      locality: "Chinhoyi",
    },
  });
  await prisma.post.create({
    data: {
      partyId: blessing.party.id,
      objective: "RENT_OUT",
      type: "HAVE",
      category: "EQUIPMENT",
      title: "Plough available to borrow after planting season",
      region: "Midlands",
      locality: "Gweru",
    },
  });
  await prisma.post.create({
    data: {
      partyId: isaac.party.id,
      objective: "BUY",
      type: "NEED",
      category: "PRODUCE",
      title: "50 bags of maize, monthly",
      region: "Midlands",
      locality: "Gweru",
      quantity: 50,
      unit: "BAG",
      neededBy: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.post.create({
    data: {
      partyId: farai.party.id,
      objective: "SELL",
      type: "HAVE",
      category: "LIVESTOCK",
      title: "Goats available, various ages",
      region: "Matabeleland South",
      locality: "Gwanda",
      quantity: 25,
    },
  });

  console.log("Backfilling repeat completed transactions (Tendai <-> Grace)...");

  // Three historical, already-settled transactions between the same pair —
  // one alone would cross into "★5.0" off a single rating, which is more
  // precise-looking than it's earned (the Directory now hides the average
  // below n=3 ratings for exactly this reason). Three real transactions
  // also makes them each other's first "Preferred partner" via Relation.
  async function seedCompletedTransaction(opts: {
    title: string;
    quantity: number;
    graceScore: number;
    graceComment: string;
    tendaiScore: number;
    tendaiComment: string;
  }) {
    const have = await prisma.post.create({
      data: {
        partyId: tendai.party.id,
        objective: "SELL",
        type: "HAVE",
        category: "LIVESTOCK",
        title: opts.title,
        region: "Mashonaland West",
        locality: "Chinhoyi",
        quantity: opts.quantity,
        status: "CLOSED",
      },
    });
    const need = await prisma.post.create({
      data: {
        partyId: grace.party.id,
        objective: "BUY",
        type: "NEED",
        category: "LIVESTOCK",
        title: `Need: ${opts.title}`,
        region: "Mashonaland West",
        locality: "Chinhoyi",
        quantity: opts.quantity,
        status: "CLOSED",
      },
    });
    const match = await prisma.match.create({
      data: {
        postAId: have.id,
        postBId: need.id,
        score: 90,
        status: "COMPLETED",
        reasons: ["same locality", "repeat trading partner"],
      },
    });

    await prisma.transactionConfirmation.create({
      data: { matchId: match.id, partyId: tendai.party.id, outcome: "COMPLETED_GOOD" },
    });
    await prisma.transactionConfirmation.create({
      data: { matchId: match.id, partyId: grace.party.id, outcome: "COMPLETED_GOOD" },
    });
    await prisma.rating.create({
      data: {
        matchId: match.id,
        authorId: grace.party.id,
        subjectId: tendai.party.id,
        score: opts.graceScore,
        comment: opts.graceComment,
      },
    });
    await prisma.rating.create({
      data: {
        matchId: match.id,
        authorId: tendai.party.id,
        subjectId: grace.party.id,
        score: opts.tendaiScore,
        comment: opts.tendaiComment,
      },
    });
  }

  await seedCompletedTransaction({
    title: "3 breeding bulls, offloaded for genetic diversity swap",
    quantity: 3,
    graceScore: 5,
    graceComment: "Great communication, healthy cattle",
    tendaiScore: 5,
    tendaiComment: "Paid promptly, easy to deal with",
  });
  await seedCompletedTransaction({
    title: "5 head of cattle for resale",
    quantity: 5,
    graceScore: 4,
    graceComment: "Good, one animal was smaller than described",
    tendaiScore: 5,
    tendaiComment: "Paid promptly via EcoCash again",
  });
  await seedCompletedTransaction({
    title: "2 goats, quick sale",
    quantity: 2,
    graceScore: 5,
    graceComment: "Reliable as always",
    tendaiScore: 4,
    tendaiComment: "Slight delay picking up but paid in full",
  });

  await recomputeReputation(tendai.party.id);
  await recomputeReputation(grace.party.id);
  await recomputeRelation(tendai.party.id, grace.party.id);

  console.log("Backfilling operational history (so anticipations have something to see)...");

  // Operational memory can only anticipate what it has already watched
  // happen at least twice. Real accounts build this up by trading; a fresh
  // demo database has no past at all, so the seed gives a couple of parties
  // a plausible two-year history — anchored to *today's* date so the
  // anticipations are live whenever the seed happens to be run, rather than
  // hard-coded to a month that may be six months away.
  const today = new Date();
  function yearsAgo(years: number, dayOffset = 0) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }

  await prisma.memoryEvent.createMany({
    data: [
      // Rudo sells oranges and hires a refrigerated truck every year at
      // this point in the season — two years running, same partner for the
      // haul. This is the pattern that produces the flagship anticipation:
      // "last year you hired a refrigerated truck around now."
      {
        partyId: rudo.party.id,
        kind: "SOLD",
        subject: "oranges",
        category: "PRODUCE",
        counterpartyId: patricia.party.id,
        quantity: 3,
        unit: "TONNE",
        occurredAt: yearsAgo(1, 2),
      },
      {
        partyId: rudo.party.id,
        kind: "SOLD",
        subject: "oranges",
        category: "PRODUCE",
        counterpartyId: patricia.party.id,
        quantity: 2.5,
        unit: "TONNE",
        occurredAt: yearsAgo(2, -4),
      },
      {
        partyId: rudo.party.id,
        kind: "TRANSPORT_HIRED",
        subject: "refrigerated truck",
        category: "TRANSPORT",
        counterpartyId: nyasha.party.id,
        occurredAt: yearsAgo(1, 3),
      },
      {
        partyId: rudo.party.id,
        kind: "TRANSPORT_HIRED",
        subject: "refrigerated truck",
        category: "TRANSPORT",
        counterpartyId: nyasha.party.id,
        occurredAt: yearsAgo(2, -2),
      },
      // Tendai services the same irrigation kit on a roughly 8-month
      // cadence, and it's now past due — the maintenance anticipation.
      {
        partyId: tendai.party.id,
        kind: "MAINTENANCE",
        subject: "drip irrigation kit",
        category: "EQUIPMENT",
        occurredAt: new Date(today.getTime() - 730 * 86_400_000),
      },
      {
        partyId: tendai.party.id,
        kind: "MAINTENANCE",
        subject: "drip irrigation kit",
        category: "EQUIPMENT",
        occurredAt: new Date(today.getTime() - 480 * 86_400_000),
      },
      {
        partyId: tendai.party.id,
        kind: "MAINTENANCE",
        subject: "drip irrigation kit",
        category: "EQUIPMENT",
        occurredAt: new Date(today.getTime() - 250 * 86_400_000),
      },
    ],
  });

  console.log("Backfilling market activity (so signals have a sample to measure)...");

  // Market signals are computed from two 14-day windows of real posting
  // activity, and deliberately refuse to say anything below a minimum sample
  // (see MIN_SAMPLE in signals-core). A nine-account demo has nowhere near
  // that, so the Market page would correctly — but unhelpfully — read "not
  // enough activity" forever.
  //
  // These are ordinary CLOSED posts backdated across both windows, i.e. the
  // same input a real month of trading produces. Nothing here writes a
  // signal directly: the signals that appear are whatever the real
  // derivation makes of this activity, so the page stays honest.
  const marketParties = [tendai, grace, blessing, isaac, rudo, patricia, farai, nyasha, tapiwa];
  const activity: {
    daysAgo: number;
    objective: "SELL" | "BUY" | "TRANSPORT_OFFER" | "TRANSPORT_NEED";
    category: "PRODUCE" | "LIVESTOCK" | "TRANSPORT";
    region: string;
    locality: string;
    title: string;
    quantity?: number;
    askingPrice?: number;
  }[] = [];

  function push(
    count: number,
    daysAgoFrom: number,
    daysAgoTo: number,
    spec: Omit<(typeof activity)[number], "daysAgo">,
  ) {
    for (let i = 0; i < count; i++) {
      const spread = daysAgoTo - daysAgoFrom;
      activity.push({
        ...spec,
        daysAgo: daysAgoFrom + Math.round((spread * i) / Math.max(1, count - 1)),
      });
    }
  }

  // Manicaland citrus season: buyers pile in this window against thin
  // supply -> demand rising + a seller's market.
  push(3, 16, 27, {
    objective: "BUY",
    category: "PRODUCE",
    region: "Manicaland",
    locality: "Mutare",
    title: "Oranges wanted",
    quantity: 2,
    askingPrice: 400,
  });
  push(9, 1, 13, {
    objective: "BUY",
    category: "PRODUCE",
    region: "Manicaland",
    locality: "Mutare",
    title: "Oranges wanted for export",
    quantity: 2,
    askingPrice: 520,
  });
  push(3, 1, 13, {
    objective: "SELL",
    category: "PRODUCE",
    region: "Manicaland",
    locality: "Mutare",
    title: "Oranges, graded",
    quantity: 2,
    askingPrice: 520,
  });

  // Manicaland transport crunch in the same window — the practical
  // consequence of everyone harvesting at once.
  push(8, 1, 13, {
    objective: "TRANSPORT_NEED",
    category: "TRANSPORT",
    region: "Manicaland",
    locality: "Mutare",
    title: "Load needs moving to Harare",
  });
  push(2, 1, 13, {
    objective: "TRANSPORT_OFFER",
    category: "TRANSPORT",
    region: "Manicaland",
    locality: "Mutare",
    title: "Truck available",
  });

  // Midlands maize: plenty of sellers, few buyers -> a glut, the opposite
  // signal, so the page isn't uniformly optimistic.
  push(10, 1, 13, {
    objective: "SELL",
    category: "PRODUCE",
    region: "Midlands",
    locality: "Gweru",
    title: "Maize, bagged",
    quantity: 50,
    askingPrice: 300,
  });
  push(2, 1, 13, {
    objective: "BUY",
    category: "PRODUCE",
    region: "Midlands",
    locality: "Gweru",
    title: "Maize wanted",
    quantity: 50,
    askingPrice: 300,
  });

  await prisma.post.createMany({
    data: activity.map((a, i) => ({
      partyId: marketParties[i % marketParties.length].party.id,
      objective: a.objective,
      type: a.objective === "SELL" || a.objective === "TRANSPORT_OFFER" ? "HAVE" : "NEED",
      category: a.category,
      title: a.title,
      region: a.region,
      locality: a.locality,
      quantity: a.quantity,
      askingPrice: a.askingPrice,
      // CLOSED so this backdated volume feeds the market picture without
      // flooding every demo account's Opportunities page with matches.
      status: "CLOSED",
      createdAt: new Date(today.getTime() - a.daysAgo * 86_400_000),
    })),
  });

  console.log("Computing market signals...");
  const signalCount = await recomputeMarketSignals();
  console.log(`  ${signalCount} signal(s) currently hold.`);

  console.log("\nSeed complete. Demo accounts (all share one password):\n");
  console.log(`  Password: ${DEMO_PASSWORD}\n`);
  const rows = [
    ["tendai@moyofarm.co.zw", "Tendai Moyo", "Farm — Chinhoyi"],
    ["tapiwa@haulzw.co.zw", "Tapiwa Muzenda", "Transporter — Chinhoyi"],
    ["grace@chikwanhatrading.co.zw", "Grace Chikwanha", "Trader — Chinhoyi"],
    ["blessing@chikaufranch.co.zw", "Blessing Chikafu", "Farm — Gweru"],
    ["isaac@moyanastores.co.zw", "Isaac Moyana", "Trader — Gweru"],
    ["rudo@sitholeorchards.co.zw", "Rudo Sithole", "Farm — Mutare"],
    ["patricia@zuluexports.co.zw", "Patricia Zulu", "Trader — Mutare"],
    ["nyasha@coldchainzw.co.zw", "Nyasha Dube", "Transporter — Mutare"],
    ["farai@ncubefarms.co.zw", "Farai Ncube", "Farm — Gwanda"],
  ];
  for (const [email, name, role] of rows) {
    console.log(`  ${email.padEnd(32)} ${name.padEnd(18)} ${role}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
