import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { MemoryKind, PostCategory } from "@/generated/prisma/enums";
import {
  detectSeasonalPatterns,
  detectMaintenanceDue,
  type MemoryRecord,
  type Anticipation,
  type MaintenanceDue,
} from "@/lib/memory-core";

// How far back pattern inference reads. Three years is enough to establish
// a seasonal habit without letting a farm's practices from five seasons ago
// — different crops, different buyers — outvote what it does now.
const MEMORY_LOOKBACK_YEARS = 3;

// Recorded, never derived on the fly: an event is a fact about what
// happened, and re-deriving facts from mutable Post/Match rows means the
// past silently changes whenever someone edits or closes a listing.
export async function recordMemory(
  event: {
    partyId: string;
    kind: MemoryKind;
    subject: string;
    category?: PostCategory | null;
    counterpartyId?: string | null;
    quantity?: number | null;
    unit?: string | null;
    occurredAt?: Date;
    matchId?: string | null;
  },
  db: Prisma.TransactionClient = prisma,
) {
  await db.memoryEvent.create({
    data: {
      partyId: event.partyId,
      kind: event.kind,
      subject: event.subject.trim(),
      category: event.category ?? null,
      counterpartyId: event.counterpartyId ?? null,
      quantity: event.quantity ?? null,
      unit: event.unit ?? null,
      occurredAt: event.occurredAt ?? new Date(),
      matchId: event.matchId ?? null,
    },
  });
}

// A completed match is the highest-quality memory the platform gets: both
// sides confirmed it, so it's a fact rather than an intention. Records both
// halves — the seller's SOLD and the buyer's BOUGHT — because each party's
// own memory should reflect what *they* did.
export async function recordCompletedTrade(
  matchId: string,
  db: Prisma.TransactionClient = prisma,
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { postA: true, postB: true },
  });
  if (!match) return;

  const { postA, postB } = match;
  const supply = postA.type === "HAVE" ? postA : postB;
  const demand = postA.type === "HAVE" ? postB : postA;

  const kindForCategory = (category: PostCategory, side: "supply" | "demand"): MemoryKind => {
    switch (category) {
      case "TRANSPORT":
        return side === "supply" ? "TRANSPORT_PROVIDED" : "TRANSPORT_HIRED";
      case "STORAGE":
        return "STORAGE_USED";
      case "LABOR":
        return "LABOR_HIRED";
      case "SERVICES":
        return "MAINTENANCE";
      case "INPUTS":
        return side === "supply" ? "SOLD" : "INPUTS_PURCHASED";
      case "EQUIPMENT":
        // RENT_OUT/RENT are a rental; SELL/BUY is a sale. The objective is
        // what distinguishes them — the category alone can't.
        if (supply.objective === "RENT_OUT") {
          return side === "supply" ? "EQUIPMENT_RENTED_OUT" : "EQUIPMENT_RENTED_IN";
        }
        return side === "supply" ? "SOLD" : "BOUGHT";
      default:
        return side === "supply" ? "SOLD" : "BOUGHT";
    }
  };

  const occurredAt = new Date();
  // The subject is the supply side's title in both records: that's the
  // thing that changed hands, and it reads correctly from either party's
  // point of view ("sold 3 tonnes of maize" / "bought 3 tonnes of maize").
  const subject = supply.title;

  await db.memoryEvent.createMany({
    data: [
      {
        partyId: supply.partyId,
        kind: kindForCategory(supply.category, "supply"),
        subject,
        category: supply.category,
        counterpartyId: demand.partyId,
        quantity: supply.quantity,
        unit: supply.unit,
        occurredAt,
        matchId,
      },
      {
        partyId: demand.partyId,
        kind: kindForCategory(demand.category, "demand"),
        subject,
        category: demand.category,
        counterpartyId: supply.partyId,
        quantity: demand.quantity,
        unit: demand.unit,
        occurredAt,
        matchId,
      },
    ],
  });
}

async function loadMemory(partyId: string): Promise<MemoryRecord[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - MEMORY_LOOKBACK_YEARS);

  const events = await prisma.memoryEvent.findMany({
    where: { partyId, occurredAt: { gte: since } },
    include: { counterparty: { select: { name: true } } },
    orderBy: { occurredAt: "desc" },
  });

  return events.map((e) => ({
    kind: e.kind,
    subject: e.subject,
    category: e.category,
    counterpartyId: e.counterpartyId,
    counterpartyName: e.counterparty?.name ?? null,
    quantity: e.quantity,
    unit: e.unit,
    occurredAt: e.occurredAt,
  }));
}

export type PartyMemory = {
  anticipations: Anticipation[];
  maintenanceDue: MaintenanceDue[];
};

export async function getPartyMemory(partyId: string, today = new Date()): Promise<PartyMemory> {
  const events = await loadMemory(partyId);
  return {
    anticipations: detectSeasonalPatterns(events, today),
    maintenanceDue: detectMaintenanceDue(events, today),
  };
}
