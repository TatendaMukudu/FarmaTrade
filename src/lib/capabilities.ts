import { Capability } from "@/generated/prisma/enums";
import type { Objective } from "@/generated/prisma/enums";

// What a participant can do, and — crucially — what work each capability
// makes them a candidate for. The second half is what turns the directory
// from a phone book into a routing table: when a farmer posts NEED_REPAIR,
// the platform knows a MECHANIC answers that, without anyone searching.
export const ALL_CAPABILITIES = Object.values(Capability);

export const CAPABILITY_LABEL: Record<Capability, string> = {
  FARMER: "Farmer",
  BUYER: "Buyer",
  SUPPLIER: "Supplier / input shop",
  TRANSPORTER: "Transporter",
  MECHANIC: "Mechanic",
  VETERINARIAN: "Veterinarian",
  AGRONOMIST: "Agronomist",
  LABOR_PROVIDER: "Labour provider",
  COLD_STORAGE: "Cold storage",
  PROCESSOR: "Processor",
  EXPORTER: "Exporter",
  CONTRACTOR: "Contractor",
  FINANCIER: "Financier",
  INSURER: "Insurer",
  DRONE_OPERATOR: "Drone operator",
  INSPECTOR: "Inspector / grader",
  GOVERNMENT: "Government / extension",
};

export const CAPABILITY_EMOJI: Record<Capability, string> = {
  FARMER: "🌾",
  BUYER: "🛒",
  SUPPLIER: "🏪",
  TRANSPORTER: "🚚",
  MECHANIC: "🛠️",
  VETERINARIAN: "🐄",
  AGRONOMIST: "🌱",
  LABOR_PROVIDER: "👷",
  COLD_STORAGE: "❄️",
  PROCESSOR: "🏭",
  EXPORTER: "🌍",
  CONTRACTOR: "📑",
  FINANCIER: "🏦",
  INSURER: "🛡️",
  DRONE_OPERATOR: "🚁",
  INSPECTOR: "🔍",
  GOVERNMENT: "🏛️",
};

// Which objectives a capability is a natural supplier of. Read in the
// opposite direction from how it looks: given an unmet objective somewhere
// in the graph, this is the set of participants worth telling about it.
//
// Only the *offering* side is listed. Any participant can post a need —
// needing a repair doesn't require a capability — so mapping needs here
// would make every capability match everything and mean nothing.
const CAPABILITY_OFFERS: Record<Capability, Objective[]> = {
  FARMER: ["SELL", "RENT_OUT"],
  BUYER: ["BUY"],
  SUPPLIER: ["SELL"],
  TRANSPORTER: ["TRANSPORT_OFFER"],
  MECHANIC: ["REPAIR_SERVICE"],
  VETERINARIAN: ["REPAIR_SERVICE", "INSPECT_OFFER"],
  AGRONOMIST: ["INSPECT_OFFER"],
  LABOR_PROVIDER: ["FIND_WORK"],
  COLD_STORAGE: ["STORAGE_OFFER"],
  PROCESSOR: ["BUY", "STORAGE_OFFER"],
  EXPORTER: ["EXPORT_OFFER", "BUY"],
  CONTRACTOR: ["FIND_WORK", "REPAIR_SERVICE"],
  FINANCIER: ["FINANCE_OFFER"],
  INSURER: ["FINANCE_OFFER"],
  DRONE_OPERATOR: ["REPAIR_SERVICE", "INSPECT_OFFER"],
  INSPECTOR: ["INSPECT_OFFER"],
  GOVERNMENT: ["INSPECT_OFFER"],
};

export function objectivesOffered(capabilities: Capability[]): Objective[] {
  const out = new Set<Objective>();
  for (const c of capabilities) {
    for (const o of CAPABILITY_OFFERS[c]) out.add(o);
  }
  return [...out];
}

// Which capabilities could answer this objective — the routing lookup the
// Opportunity engine uses to find people who could serve a need even when
// nobody has posted the matching offer yet. Without this, a need only ever
// finds an existing post; with it, the platform can reach the mechanic who
// simply hasn't advertised this week.
export function capabilitiesFor(objective: Objective): Capability[] {
  return ALL_CAPABILITIES.filter((c) => CAPABILITY_OFFERS[c].includes(objective));
}

export function capabilityLabels(capabilities: Capability[]): string {
  return capabilities.map((c) => CAPABILITY_LABEL[c]).join(" · ");
}

// Zimbabwe's working languages for trade. Suggested, not enforced, same
// pattern as CURRENCIES and `unit` — a Tonga- or Venda-speaking trader in
// the south should be able to write that in rather than be told their
// language isn't on the list.
export const COMMON_LANGUAGES = ["English", "Shona", "Ndebele", "Chewa", "Tonga"] as const;
