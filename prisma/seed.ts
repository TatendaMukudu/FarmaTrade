import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Override via SEED_PASSWORD for any non-local database — this file is
// committed to a public(ly visible) repo, so the fallback below should
// only ever be relied on for a local dev database.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "FarmaTrade2026!";

type Role = "FARM" | "TRADER" | "TRANSPORTER";

async function createAccount(opts: {
  email: string;
  name: string;
  phone: string;
  province: string;
  district: string;
  roles: Role[];
  passwordHash: string;
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
      province: opts.province,
      district: opts.district,
      roles: opts.roles,
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

async function main() {
  console.log("Wiping existing data...");
  await prisma.rating.deleteMany();
  await prisma.transactionConfirmation.deleteMany();
  await prisma.match.deleteMany();
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
    province: "Mashonaland West",
    district: "Chinhoyi",
    roles: ["FARM"],
    passwordHash,
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
    province: "Mashonaland West",
    district: "Chinhoyi",
    roles: ["TRANSPORTER"],
    passwordHash,
    transport: { vehicleType: "TRUCK", capacityKg: 7000, serviceRegion: "Mashonaland West" },
  });

  const grace = await createAccount({
    email: "grace@chikwanhatrading.co.zw",
    name: "Grace Chikwanha",
    phone: "+263771234003",
    province: "Mashonaland West",
    district: "Chinhoyi",
    roles: ["TRADER"],
    passwordHash,
  });

  // --- Midlands / Gweru ---
  const blessing = await createAccount({
    email: "blessing@chikaufranch.co.zw",
    name: "Blessing Chikafu",
    phone: "+263771234004",
    province: "Midlands",
    district: "Gweru",
    roles: ["FARM"],
    passwordHash,
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
    province: "Midlands",
    district: "Gweru",
    roles: ["TRADER"],
    passwordHash,
  });

  // --- Manicaland / Mutare ---
  const rudo = await createAccount({
    email: "rudo@sitholeorchards.co.zw",
    name: "Rudo Sithole",
    phone: "+263771234006",
    province: "Manicaland",
    district: "Mutare",
    roles: ["FARM"],
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
    province: "Manicaland",
    district: "Mutare",
    roles: ["TRADER"],
    passwordHash,
  });

  const nyasha = await createAccount({
    email: "nyasha@coldchainzw.co.zw",
    name: "Nyasha Dube",
    phone: "+263771234008",
    province: "Manicaland",
    district: "Mutare",
    roles: ["TRANSPORTER"],
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
    province: "Matabeleland South",
    district: "Gwanda",
    roles: ["FARM"],
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
      type: "HAVE",
      category: "PRODUCE",
      title: "3 tonnes of oranges, need to move before they spoil",
      province: "Manicaland",
      district: "Mutare",
      quantity: 3,
      unit: "TONNE",
    },
  });
  const orangesNeed = await prisma.post.create({
    data: {
      partyId: patricia.party.id,
      type: "NEED",
      category: "PRODUCE",
      title: "Oranges for export, any quantity",
      province: "Manicaland",
      district: "Mutare",
    },
  });
  await prisma.match.create({
    data: { postAId: orangesHave.id, postBId: orangesNeed.id, score: 78, status: "SUGGESTED" },
  });

  // Live opportunity: Rudo needs refrigerated transport <-> Nyasha has it (Mutare)
  const transportNeed = await prisma.post.create({
    data: {
      partyId: rudo.party.id,
      type: "NEED",
      category: "TRANSPORT",
      title: "Refrigerated truck needed this week",
      province: "Manicaland",
      district: "Mutare",
    },
  });
  const transportHave = await prisma.post.create({
    data: {
      partyId: nyasha.party.id,
      type: "HAVE",
      category: "TRANSPORT",
      title: "Refrigerated truck, based in Mutare",
      province: "Manicaland",
      district: "Mutare",
    },
  });
  await prisma.match.create({
    data: { postAId: transportNeed.id, postBId: transportHave.id, score: 82, status: "SUGGESTED" },
  });

  // Open posts with no live match yet — realistic "waiting" state
  await prisma.post.create({
    data: {
      partyId: tendai.party.id,
      type: "HAVE",
      category: "EQUIPMENT",
      title: "Idle tractor, available most of the season",
      province: "Mashonaland West",
      district: "Chinhoyi",
    },
  });
  await prisma.post.create({
    data: {
      partyId: tapiwa.party.id,
      type: "HAVE",
      category: "TRANSPORT",
      title: "7-tonne truck available for local hauls",
      province: "Mashonaland West",
      district: "Chinhoyi",
    },
  });
  await prisma.post.create({
    data: {
      partyId: blessing.party.id,
      type: "HAVE",
      category: "EQUIPMENT",
      title: "Plough available to borrow after planting season",
      province: "Midlands",
      district: "Gweru",
    },
  });
  await prisma.post.create({
    data: {
      partyId: isaac.party.id,
      type: "NEED",
      category: "PRODUCE",
      title: "50 bags of maize, monthly",
      province: "Midlands",
      district: "Gweru",
      quantity: 50,
      unit: "BAG",
    },
  });
  await prisma.post.create({
    data: {
      partyId: farai.party.id,
      type: "HAVE",
      category: "LIVESTOCK",
      title: "Goats available, various ages",
      province: "Matabeleland South",
      district: "Gwanda",
      quantity: 25,
    },
  });

  console.log("Backfilling a completed transaction (Tendai <-> Grace)...");

  // Historical, already-settled transaction — gives the Directory real
  // reputation data instead of every party showing "New".
  const cattleHave = await prisma.post.create({
    data: {
      partyId: tendai.party.id,
      type: "HAVE",
      category: "LIVESTOCK",
      title: "3 breeding bulls, offloading for genetic diversity swap",
      province: "Mashonaland West",
      district: "Chinhoyi",
      quantity: 3,
      status: "CLOSED",
    },
  });
  const cattleNeed = await prisma.post.create({
    data: {
      partyId: grace.party.id,
      type: "NEED",
      category: "LIVESTOCK",
      title: "Breeding bulls for herd",
      province: "Mashonaland West",
      district: "Chinhoyi",
      quantity: 3,
      status: "CLOSED",
    },
  });
  const cattleMatch = await prisma.match.create({
    data: {
      postAId: cattleHave.id,
      postBId: cattleNeed.id,
      score: 90,
      status: "COMPLETED",
    },
  });

  await prisma.transactionConfirmation.create({
    data: {
      matchId: cattleMatch.id,
      partyId: tendai.party.id,
      outcome: "COMPLETED_GOOD",
      notes: "Paid promptly via EcoCash",
    },
  });
  await prisma.transactionConfirmation.create({
    data: {
      matchId: cattleMatch.id,
      partyId: grace.party.id,
      outcome: "COMPLETED_GOOD",
      notes: "Healthy cattle, exactly as described",
    },
  });
  await prisma.rating.create({
    data: {
      matchId: cattleMatch.id,
      authorId: grace.party.id,
      subjectId: tendai.party.id,
      score: 5,
      comment: "Great communication, healthy cattle",
    },
  });
  await prisma.rating.create({
    data: {
      matchId: cattleMatch.id,
      authorId: tendai.party.id,
      subjectId: grace.party.id,
      score: 5,
      comment: "Paid promptly, easy to deal with",
    },
  });

  await recomputeReputation(tendai.party.id);
  await recomputeReputation(grace.party.id);

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
