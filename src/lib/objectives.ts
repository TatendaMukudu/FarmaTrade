import type { Objective, PostType, PostCategory } from "@/generated/prisma/enums";

// The intent layer. A Post used to say only which direction it pointed
// (HAVE/NEED) and which vertical it sat in (PostCategory) — which cannot
// tell "I'm selling my tractor" from "I'll rent you my tractor" from "I'll
// come and plough your field with it". Those are three businesses, and
// under HAVE+EQUIPMENT the matching engine confidently paired all of them
// with each other.
//
// Every objective declares its own counterpart, so matching becomes
// semantic: SELL pairs with BUY and nothing else, RENT_OUT pairs with RENT
// and nothing else. `type` is kept in sync with the counterpart mapping
// (one side HAVE, the other NEED) so the existing engine, indexes and
// queries keep working unchanged — this narrows what qualifies, it doesn't
// replace the pairing rule.
//
// Pure and DB-free, same reasoning as matching-core.ts: it's the definition
// table the whole product reads from, and it should be unit-testable
// without a database.
export type ObjectiveSpec = {
  objective: Objective;
  // What the user picks, phrased as the thing they're trying to get done.
  // This is the actual copy on the composer — the product's opening
  // question is "what are you trying to accomplish", so these have to read
  // as answers to that, not as listing categories.
  prompt: string;
  // Compact form for chips, filters and badges.
  label: string;
  emoji: string;
  type: PostType;
  category: PostCategory;
  // Third person, for rendering someone else's objective on a card:
  // "Grace Chikwanha is buying".
  verb: string;
  // Bare gerund ("selling", "renting out"), for constructions where the
  // subject changes person — "they're selling, you're buying". Reusing
  // `verb` there produces "you wants to rent".
  gerund: string;
  // The objective that answers this one. Always symmetric:
  // COUNTERPART[COUNTERPART[x]] === x (asserted in the tests).
  counterpart: Objective;
};

export const OBJECTIVES: Record<Objective, ObjectiveSpec> = {
  SELL: {
    objective: "SELL",
    prompt: "Sell produce, livestock or equipment",
    label: "Selling",
    emoji: "🌾",
    type: "HAVE",
    category: "PRODUCE",
    verb: "is selling",
    gerund: "selling",
    counterpart: "BUY",
  },
  BUY: {
    objective: "BUY",
    prompt: "Buy produce, livestock, equipment or supplies",
    label: "Buying",
    emoji: "🛒",
    type: "NEED",
    category: "PRODUCE",
    verb: "wants to buy",
    gerund: "buying",
    counterpart: "SELL",
  },
  RENT_OUT: {
    objective: "RENT_OUT",
    prompt: "Rent out equipment I'm not using",
    label: "Renting out",
    emoji: "🚜",
    type: "HAVE",
    category: "EQUIPMENT",
    verb: "is renting out",
    gerund: "renting out",
    counterpart: "RENT",
  },
  RENT: {
    objective: "RENT",
    prompt: "Rent equipment I need",
    label: "Renting",
    emoji: "🔧",
    type: "NEED",
    category: "EQUIPMENT",
    verb: "wants to rent",
    gerund: "renting",
    counterpart: "RENT_OUT",
  },
  HIRE_LABOR: {
    objective: "HIRE_LABOR",
    prompt: "Hire workers",
    label: "Hiring",
    emoji: "👷",
    type: "NEED",
    category: "LABOR",
    verb: "is hiring",
    gerund: "hiring",
    counterpart: "FIND_WORK",
  },
  FIND_WORK: {
    objective: "FIND_WORK",
    prompt: "Find farm work",
    label: "Available for work",
    emoji: "🙋",
    type: "HAVE",
    category: "LABOR",
    verb: "is available for work",
    gerund: "looking for work",
    counterpart: "HIRE_LABOR",
  },
  REPAIR_SERVICE: {
    objective: "REPAIR_SERVICE",
    prompt: "Offer repairs or servicing",
    label: "Repairs offered",
    emoji: "🛠️",
    type: "HAVE",
    category: "SERVICES",
    verb: "offers repairs",
    gerund: "offering repairs",
    counterpart: "NEED_REPAIR",
  },
  NEED_REPAIR: {
    objective: "NEED_REPAIR",
    prompt: "Get something repaired",
    label: "Needs repair",
    emoji: "⚠️",
    type: "NEED",
    category: "SERVICES",
    verb: "needs a repair",
    gerund: "needing a repair",
    counterpart: "REPAIR_SERVICE",
  },
  TRANSPORT_OFFER: {
    objective: "TRANSPORT_OFFER",
    prompt: "Offer transport on a route I'm running",
    label: "Transport offered",
    emoji: "🚚",
    type: "HAVE",
    category: "TRANSPORT",
    verb: "is offering transport",
    gerund: "offering transport",
    counterpart: "TRANSPORT_NEED",
  },
  TRANSPORT_NEED: {
    objective: "TRANSPORT_NEED",
    prompt: "Move goods somewhere",
    label: "Needs transport",
    emoji: "📦",
    type: "NEED",
    category: "TRANSPORT",
    verb: "needs transport",
    gerund: "needing transport",
    counterpart: "TRANSPORT_OFFER",
  },
  STORAGE_OFFER: {
    objective: "STORAGE_OFFER",
    prompt: "Offer storage or cold-chain space",
    label: "Storage offered",
    emoji: "🏬",
    type: "HAVE",
    category: "STORAGE",
    verb: "is offering storage",
    gerund: "offering storage",
    counterpart: "STORAGE_NEED",
  },
  STORAGE_NEED: {
    objective: "STORAGE_NEED",
    prompt: "Find somewhere to store a crop",
    label: "Needs storage",
    emoji: "❄️",
    type: "NEED",
    category: "STORAGE",
    verb: "needs storage",
    gerund: "needing storage",
    counterpart: "STORAGE_OFFER",
  },
  FINANCE_OFFER: {
    objective: "FINANCE_OFFER",
    prompt: "Offer financing, credit or insurance",
    label: "Finance offered",
    emoji: "🏦",
    type: "HAVE",
    category: "FINANCE",
    verb: "offers financing",
    gerund: "offering finance",
    counterpart: "FINANCE_NEED",
  },
  FINANCE_NEED: {
    objective: "FINANCE_NEED",
    prompt: "Find financing or input credit",
    label: "Needs finance",
    emoji: "💵",
    type: "NEED",
    category: "FINANCE",
    verb: "needs financing",
    gerund: "needing finance",
    counterpart: "FINANCE_OFFER",
  },
  INSPECT_OFFER: {
    objective: "INSPECT_OFFER",
    prompt: "Offer inspection, grading or certification",
    label: "Inspection offered",
    emoji: "🔍",
    type: "HAVE",
    category: "SERVICES",
    verb: "offers inspection",
    gerund: "offering inspection",
    counterpart: "INSPECT_NEED",
  },
  INSPECT_NEED: {
    objective: "INSPECT_NEED",
    prompt: "Get a crop inspected, graded or certified",
    label: "Needs inspection",
    emoji: "📋",
    type: "NEED",
    category: "SERVICES",
    verb: "needs inspection",
    gerund: "needing inspection",
    counterpart: "INSPECT_OFFER",
  },
  EXPORT_OFFER: {
    objective: "EXPORT_OFFER",
    prompt: "Help others export",
    label: "Export help offered",
    emoji: "🌍",
    type: "HAVE",
    category: "SERVICES",
    verb: "offers export help",
    gerund: "offering export help",
    counterpart: "EXPORT_NEED",
  },
  EXPORT_NEED: {
    objective: "EXPORT_NEED",
    prompt: "Export a crop",
    label: "Wants to export",
    emoji: "✈️",
    type: "NEED",
    category: "SERVICES",
    verb: "wants to export",
    gerund: "wanting to export",
    counterpart: "EXPORT_OFFER",
  },
};

export const ALL_OBJECTIVES = Object.values(OBJECTIVES);

export function objectiveSpec(objective: Objective): ObjectiveSpec {
  return OBJECTIVES[objective];
}

// The objectives worth putting in front of someone on the composer, in the
// order they should appear. Ordered by how often a smallholder actually
// needs them — selling and buying first, the specialist services last —
// rather than alphabetically or by enum declaration order.
export const COMMON_OBJECTIVES: Objective[] = [
  "SELL",
  "BUY",
  "TRANSPORT_NEED",
  "RENT",
  "NEED_REPAIR",
  "HIRE_LABOR",
  "STORAGE_NEED",
  "FINANCE_NEED",
  "RENT_OUT",
  "TRANSPORT_OFFER",
  "REPAIR_SERVICE",
  "FIND_WORK",
  "STORAGE_OFFER",
  "INSPECT_NEED",
  "EXPORT_NEED",
  "FINANCE_OFFER",
  "INSPECT_OFFER",
  "EXPORT_OFFER",
];

// Which categories an objective is allowed to carry. Most objectives imply
// exactly one vertical, but SELL/BUY span goods — a farmer selling maize
// and a shop selling fertilizer are the same objective in different
// categories, and forcing them apart would fragment the busiest pairing on
// the platform.
const GOODS_CATEGORIES: PostCategory[] = ["PRODUCE", "LIVESTOCK", "EQUIPMENT", "INPUTS"];

export function categoriesForObjective(objective: Objective): PostCategory[] {
  if (objective === "SELL" || objective === "BUY") return GOODS_CATEGORIES;
  return [OBJECTIVES[objective].category];
}

// Whether two objectives are a valid pairing. This is the semantic upgrade
// over "opposite PostType in the same category": under the old rule a
// tractor for sale matched someone looking to rent one, because both were
// EQUIPMENT pointing opposite ways.
export function objectivesPair(a: Objective, b: Objective): boolean {
  return OBJECTIVES[a].counterpart === b;
}
