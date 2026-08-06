import type { Anticipation, MaintenanceDue } from "@/lib/memory-core";

// The briefing is the product's answer to "how is my farm doing today, and
// what can I help you accomplish" — so it is explicitly *not* a dashboard
// of counts. Counts are things a user has to interpret; a briefing is a
// ranked list of things to do, each already explaining itself.
//
// Pure and DB-free so the ranking rules — the actual product judgement
// about what deserves someone's attention first — can be tested directly.

export type BriefingKind =
  | "waiting_on_you"
  | "time_critical"
  | "maintenance"
  | "anticipation"
  | "opportunity"
  | "signal";

export type BriefingItem = {
  key: string;
  kind: BriefingKind;
  emoji: string;
  headline: string;
  detail: string;
  href: string;
  actionLabel: string;
  // Computed, not hand-set per item: see rank().
  priority: number;
};

// Base weight per kind, in the order a person running a business actually
// needs them. Someone waiting on a reply outranks a good opportunity,
// because the first is a commitment already made and the second is optional
// — and a briefing that buries commitments under suggestions is how a user
// learns the top of the page isn't trustworthy.
const KIND_WEIGHT: Record<BriefingKind, number> = {
  time_critical: 1000,
  waiting_on_you: 900,
  maintenance: 700,
  anticipation: 600,
  opportunity: 400,
  signal: 200,
};

export type BriefingInputs = {
  draftCount: number;
  // Matches this party accepted where the counterparty has confirmed and
  // they haven't — someone is literally waiting on them.
  awaitingYourConfirmation: { matchId: string; counterpartyName: string }[];
  unreadConversations: { matchId: string; counterpartyName: string }[];
  // Suggested matches flagged time-sensitive on either side.
  urgentMatches: { matchId: string; counterpartyName: string; title: string }[];
  topOpportunities: {
    matchId: string;
    counterpartyName: string;
    title: string;
    score: number;
    reasons: string[];
  }[];
  anticipations: Anticipation[];
  maintenanceDue: MaintenanceDue[];
  signals: { id: string; headline: string; detail: string; strength: number }[];
};

export function buildBriefing(inputs: BriefingInputs): BriefingItem[] {
  const items: BriefingItem[] = [];

  for (const m of inputs.urgentMatches) {
    items.push({
      key: `urgent:${m.matchId}`,
      kind: "time_critical",
      emoji: "⏰",
      headline: `Time-sensitive: ${m.title}`,
      detail: `${m.counterpartyName} — this one won't wait.`,
      href: "/dashboard/opportunities",
      actionLabel: "Respond",
      priority: 0,
    });
  }

  for (const c of inputs.awaitingYourConfirmation) {
    items.push({
      key: `confirm:${c.matchId}`,
      kind: "waiting_on_you",
      emoji: "✅",
      headline: `${c.counterpartyName} confirmed your trade`,
      detail: "Confirm your side to complete it and release both reputations.",
      href: "/dashboard/opportunities",
      actionLabel: "Confirm",
      priority: 0,
    });
  }

  for (const c of inputs.unreadConversations) {
    items.push({
      key: `reply:${c.matchId}`,
      kind: "waiting_on_you",
      emoji: "💬",
      headline: `${c.counterpartyName} is waiting on your reply`,
      detail: "Response time is part of your reputation.",
      href: `/dashboard/conversations/${c.matchId}`,
      actionLabel: "Reply",
      priority: 0,
    });
  }

  if (inputs.draftCount > 0) {
    items.push({
      key: "drafts",
      kind: "waiting_on_you",
      emoji: "🌾",
      headline: `${inputs.draftCount} listing${inputs.draftCount === 1 ? "" : "s"} ready to publish`,
      detail: "Drafted from your upcoming harvest — confirm to start matching.",
      href: "/dashboard/posts",
      actionLabel: "Review",
      priority: 0,
    });
  }

  for (const m of inputs.maintenanceDue) {
    items.push({
      key: `maint:${m.key}`,
      kind: "maintenance",
      emoji: "🛠️",
      headline: m.headline,
      detail: m.detail,
      href: "/dashboard/posts?objective=NEED_REPAIR",
      actionLabel: "Find a mechanic",
      priority: 0,
    });
  }

  for (const a of inputs.anticipations) {
    items.push({
      key: `antic:${a.key}`,
      kind: "anticipation",
      emoji: "🔮",
      headline: a.headline,
      detail: a.detail,
      href: "/dashboard/posts",
      actionLabel: a.usualCounterpartyId ? `Contact ${a.usualCounterpartyName}` : "Get ahead of it",
      priority: 0,
    });
  }

  for (const o of inputs.topOpportunities) {
    items.push({
      key: `opp:${o.matchId}`,
      kind: "opportunity",
      emoji: "🤝",
      headline: `${o.counterpartyName}: ${o.title}`,
      detail: o.reasons.slice(0, 3).join(" · "),
      href: "/dashboard/opportunities",
      actionLabel: "View",
      priority: 0,
    });
  }

  for (const s of inputs.signals) {
    items.push({
      key: `signal:${s.id}`,
      kind: "signal",
      emoji: "📈",
      headline: s.headline,
      detail: s.detail,
      href: "/dashboard/market",
      actionLabel: "See market",
      priority: 0,
    });
  }

  return rank(items, inputs);
}

// Within a kind, order by how strong the specific evidence is — the
// confidence of an anticipation, the score of an opportunity, the strength
// of a signal — so a weak item never outranks a strong one of the same kind
// just because it was pushed first.
function rank(items: BriefingItem[], inputs: BriefingInputs): BriefingItem[] {
  const confidenceByKey = new Map<string, number>();
  for (const a of inputs.anticipations) confidenceByKey.set(`antic:${a.key}`, a.confidence);
  for (const o of inputs.topOpportunities) confidenceByKey.set(`opp:${o.matchId}`, o.score / 100);
  for (const s of inputs.signals) confidenceByKey.set(`signal:${s.id}`, s.strength);
  for (const m of inputs.maintenanceDue) confidenceByKey.set(`maint:${m.key}`, m.confidence);

  return items
    .map((item) => ({
      ...item,
      priority: KIND_WEIGHT[item.kind] + Math.round((confidenceByKey.get(item.key) ?? 0.5) * 99),
    }))
    .sort((a, b) => b.priority - a.priority);
}

// What the briefing says when there is genuinely nothing to do. An empty
// state is still a briefing — "you're on top of everything" is a real
// answer to "how is my farm doing today", and better than a blank page
// implying the platform is broken.
export function briefingEmptyState(hasPosts: boolean): { headline: string; detail: string } {
  return hasPosts
    ? {
        headline: "Nothing needs you right now",
        detail: "Your listings are live and matching. We'll surface anything that comes up.",
      }
    : {
        headline: "Tell FarmaTrade what you're trying to do",
        detail: "Sell a crop, find transport, hire workers — everything starts from an objective.",
      };
}
