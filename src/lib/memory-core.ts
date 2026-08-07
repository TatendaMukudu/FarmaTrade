import type { MemoryKind, PostCategory } from "@/generated/prisma/enums";

// Operational memory: pattern inference over what a participant has
// actually done, so the platform can anticipate instead of react.
//
// "Last year you rented a refrigerated truck around this time" is only
// possible if something remembers last year. Post and Match both close and
// get filtered out of the working set, so neither can answer it — hence a
// separate append-only event log, and this file: the pure inference over
// that log.
//
// Deliberately conservative. Every anticipation shown to a user spends
// trust, and a wrong one ("you usually buy fertiliser in June" to someone
// who did it once) spends more than a right one earns. Thresholds below
// are set so a pattern has to actually repeat before it's claimed.

export type MemoryRecord = {
  kind: MemoryKind;
  subject: string;
  category: PostCategory | null;
  counterpartyId: string | null;
  counterpartyName?: string | null;
  quantity: number | null;
  unit: string | null;
  occurredAt: Date;
};

// A pattern must have happened in at least this many distinct years to be
// called seasonal. Two is the minimum that can distinguish "a habit" from
// "a thing that happened once" — one occurrence is an anecdote, and
// presenting it as a pattern is how a platform teaches users to ignore it.
export const MIN_YEARS_FOR_SEASONAL = 2;

// How close to the anniversary counts as "around now".
export const SEASONAL_WINDOW_DAYS = 30;

export type Anticipation = {
  // Stable key so the UI can dedupe and the user can dismiss one.
  key: string;
  kind: MemoryKind;
  subject: string;
  category: PostCategory | null;
  // Plain language, ready to render — the same discipline as Match.reasons:
  // the layer that shows this shouldn't have to invent the justification.
  headline: string;
  detail: string;
  // Day-of-year the pattern historically centres on.
  typicalDayOfYear: number;
  daysUntil: number;
  occurrences: number;
  // 0..1 — how strongly the history supports this.
  confidence: number;
  // Counterparty this was usually done with, when there's a clear one.
  usualCounterpartyId: string | null;
  usualCounterpartyName: string | null;
};

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86_400_000);
}

// Circular distance in days — 20 December and 5 January are 16 days apart,
// not 349. Zimbabwe's main planting season straddles the new year, so
// getting this wrong would silently drop the single most important
// agricultural pattern on the platform.
function circularDayDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 365 - raw);
}

// Mean of a set of day-of-year values, computed on the circle so a cluster
// spanning the year boundary averages to the cluster, not to July.
function circularMeanDay(days: number[]): number {
  const radians = days.map((d) => (d / 365) * 2 * Math.PI);
  const x = radians.reduce((s, r) => s + Math.cos(r), 0) / radians.length;
  const y = radians.reduce((s, r) => s + Math.sin(r), 0) / radians.length;
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;
  const day = Math.round((angle / (2 * Math.PI)) * 365);
  return day === 0 ? 365 : day;
}

const KIND_PHRASE: Record<MemoryKind, { verb: string; noun: string }> = {
  HARVEST: { verb: "harvest", noun: "harvest" },
  SOLD: { verb: "sell", noun: "sale" },
  BOUGHT: { verb: "buy", noun: "purchase" },
  TRANSPORT_HIRED: { verb: "hire", noun: "transport hire" },
  TRANSPORT_PROVIDED: { verb: "haul", noun: "haulage job" },
  EQUIPMENT_RENTED_OUT: { verb: "rent out", noun: "rental" },
  EQUIPMENT_RENTED_IN: { verb: "rent", noun: "rental" },
  MAINTENANCE: { verb: "service", noun: "service" },
  INPUTS_PURCHASED: { verb: "buy", noun: "input purchase" },
  LABOR_HIRED: { verb: "take on", noun: "hire" },
  STORAGE_USED: { verb: "book storage for", noun: "storage booking" },
};

// Bulk commodities that read wrong with an article — "hire a refrigerated
// truck" is right, "sell a maize" is not. Subjects come from post titles and
// the farmer's own words, so this can't be perfect; it's tuned so the common
// Zimbabwean cases read naturally and the rare miss is mild.
const MASS_NOUNS = new Set([
  "maize",
  "seed",
  "fertiliser",
  "fertilizer",
  "feed",
  "grain",
  "hay",
  "produce",
  "water",
  "fuel",
  "manure",
  "cotton",
  "tobacco",
  "soya",
  "wheat",
  "sorghum",
  "labour",
  "labor",
]);

function withArticle(subject: string): string {
  const head = subject.trim().toLowerCase();
  const firstWord = head.split(/[\s,]/)[0];
  // Plurals ("oranges", "goats") and mass nouns take no article.
  if (MASS_NOUNS.has(firstWord)) return subject;
  if (/[^s]s$/.test(firstWord)) return subject;
  // A leading quantity is already a determiner: "3 tonnes of oranges".
  if (/^\d/.test(head)) return subject;
  return `${/^[aeiou]/.test(head) ? "an" : "a"} ${subject}`;
}

// Groups events by what they're about (kind + subject) and returns the ones
// that recur at the same time of year. `today` is injected rather than read
// from the clock so this stays pure and the tests are deterministic.
export function detectSeasonalPatterns(events: MemoryRecord[], today: Date): Anticipation[] {
  const groups = new Map<string, MemoryRecord[]>();
  for (const e of events) {
    // Servicing is a cadence, not a season — a pump serviced every 8 months
    // isn't annual, and detectMaintenanceDue models it properly from the
    // actual intervals. Letting both fire put the same asset on the briefing
    // twice, once with worse reasoning.
    if (e.kind === "MAINTENANCE") continue;
    const key = `${e.kind}:${e.subject.trim().toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const todayDay = dayOfYear(today);
  const out: Anticipation[] = [];

  for (const [key, group] of groups) {
    const years = new Set(group.map((e) => e.occurredAt.getUTCFullYear()));
    if (years.size < MIN_YEARS_FOR_SEASONAL) continue;

    const days = group.map((e) => dayOfYear(e.occurredAt));
    const typical = circularMeanDay(days);

    // Only anticipate what's actually coming up. A pattern centred on
    // August is not news in February — it's clutter, and clutter is how a
    // briefing stops being read.
    const distance = circularDayDistance(typical, todayDay);
    if (distance > SEASONAL_WINDOW_DAYS) continue;

    // Signed: negative means the usual date has just passed, which is worth
    // saying differently ("you usually did this by now") from an upcoming one.
    let daysUntil = typical - todayDay;
    if (daysUntil > 182) daysUntil -= 365;
    if (daysUntil < -182) daysUntil += 365;

    // How tightly the occurrences cluster — a pattern that happens within a
    // fortnight every year is a stronger claim than one smeared across two
    // months, and the confidence the UI shows should say so.
    const spread = days.reduce((sum, d) => sum + circularDayDistance(d, typical), 0) / days.length;
    const tightness = Math.max(0, 1 - spread / SEASONAL_WINDOW_DAYS);
    const confidence = Math.min(1, (years.size / 3) * 0.6 + tightness * 0.4);

    const counterpartyCounts = new Map<string, { name: string | null; count: number }>();
    for (const e of group) {
      if (!e.counterpartyId) continue;
      const existing = counterpartyCounts.get(e.counterpartyId);
      if (existing) existing.count += 1;
      else counterpartyCounts.set(e.counterpartyId, { name: e.counterpartyName ?? null, count: 1 });
    }
    const topCounterparty = [...counterpartyCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    // Only call someone "usual" if they were involved in more than one of
    // the occurrences — otherwise it's just whoever happened to be there.
    const usual = topCounterparty && topCounterparty[1].count >= 2 ? topCounterparty : null;

    const sample = group[0];
    const phrase = KIND_PHRASE[sample.kind];
    const when =
      daysUntil > 1
        ? `in about ${daysUntil} days`
        : daysUntil >= -1
          ? "around now"
          : `${Math.abs(daysUntil)} days ago`;

    const object = withArticle(sample.subject);
    out.push({
      key,
      kind: sample.kind,
      subject: sample.subject,
      category: sample.category,
      headline:
        daysUntil >= -1
          ? `You usually ${phrase.verb} ${object} around now`
          : `You usually ${phrase.verb} ${object} by now`,
      detail: `${years.size} year${years.size === 1 ? "" : "s"} running, typically ${when}${
        usual ? `, usually with ${usual[1].name ?? "the same partner"}` : ""
      }.`,
      typicalDayOfYear: typical,
      daysUntil,
      occurrences: group.length,
      confidence,
      usualCounterpartyId: usual ? usual[0] : null,
      usualCounterpartyName: usual ? usual[1].name : null,
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

// Service intervals: an asset that's been maintained repeatedly builds its
// own cadence, and the gap since the last service is the signal. Distinct
// from seasonality — a pump serviced every 8 months isn't annual, so
// detectSeasonalPatterns would never see it.
export const MIN_SERVICES_FOR_INTERVAL = 2;

export type MaintenanceDue = {
  key: string;
  subject: string;
  headline: string;
  detail: string;
  daysSinceLast: number;
  typicalIntervalDays: number;
  overdueBy: number;
  confidence: number;
};

export function detectMaintenanceDue(events: MemoryRecord[], today: Date): MaintenanceDue[] {
  const bySubject = new Map<string, Date[]>();
  for (const e of events) {
    if (e.kind !== "MAINTENANCE") continue;
    const key = e.subject.trim().toLowerCase();
    const list = bySubject.get(key);
    if (list) list.push(e.occurredAt);
    else bySubject.set(key, [e.occurredAt]);
  }

  const out: MaintenanceDue[] = [];
  for (const [key, rawDates] of bySubject) {
    if (rawDates.length < MIN_SERVICES_FOR_INTERVAL) continue;
    const dates = [...rawDates].sort((a, b) => a.getTime() - b.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000);
    }
    const typical = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (typical <= 0) continue;

    const last = dates[dates.length - 1];
    const daysSinceLast = (today.getTime() - last.getTime()) / 86_400_000;
    const overdueBy = daysSinceLast - typical;

    // Surface a little before it's due, not only once it's late — the point
    // is to prevent the breakdown, not to report it.
    if (overdueBy < -typical * 0.15) continue;

    // Subjects are lower-cased for grouping, so the display form has to be
    // re-capitalised — a headline starting "drip irrigation kit" reads like
    // a bug even when the logic behind it is right.
    const name = key.charAt(0).toUpperCase() + key.slice(1);

    out.push({
      key,
      subject: key,
      headline:
        overdueBy > 0
          ? `${name} is overdue for a service`
          : `${name} is due for a service soon`,
      detail: `Serviced ${dates.length} times, roughly every ${Math.round(typical)} days. Last done ${Math.round(daysSinceLast)} days ago.`,
      daysSinceLast: Math.round(daysSinceLast),
      typicalIntervalDays: Math.round(typical),
      overdueBy: Math.round(overdueBy),
      confidence: Math.min(1, dates.length / 4),
    });
  }

  return out.sort((a, b) => b.overdueBy - a.overdueBy);
}
