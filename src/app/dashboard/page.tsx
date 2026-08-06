import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { ensureHarvestDrafts } from "@/lib/harvest-drafts";
import { getBriefing } from "@/lib/briefing";
import { briefingEmptyState, type BriefingItem } from "@/lib/briefing-core";
import { OBJECTIVES } from "@/lib/objectives";
import type { Objective } from "@/generated/prisma/enums";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Harare",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Deliberately not a dashboard of counts. "3 active listings" is a number
// the user has to interpret; a briefing is a ranked list of things that
// need them, each already explaining why it's there. The question this page
// answers is "how is my business doing today, and what should I do next" —
// so everything on it is either an action or the reason for one.
export default async function DashboardPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  if (party.farm) {
    await ensureHarvestDrafts(party.farm.id, party);
  }

  const briefing = await getBriefing(party);

  // The top few are the briefing proper; the rest is available but folded
  // away, because a list long enough to scroll is a list nobody triages.
  const headline = briefing.items.slice(0, 6);
  const rest = briefing.items.slice(6);
  const empty = briefingEmptyState(briefing.hasPosts);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}, {party.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500">
          {party.farm ? party.farm.farmName : `${party.district}, ${party.province}`}
          {headline.length > 0 && ` · ${headline.length} thing${headline.length === 1 ? "" : "s"} for you today`}
        </p>
      </div>

      {headline.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="text-lg font-medium">{empty.headline}</p>
          <p className="mt-1 text-sm text-gray-500">{empty.detail}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {headline.map((item) => (
            <BriefingCard key={item.key} item={item} />
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <details className="rounded-xl border border-border bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm text-gray-600 select-none">
            {rest.length} more
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {rest.map((item) => (
              <BriefingCard key={item.key} item={item} />
            ))}
          </ul>
        </details>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium">Start something</h2>
          {/* Posts have no nav entry of their own by design — the product
              leads with objectives, not with a listings inbox — but the
              things you already started still have to be one tap away. */}
          <Link href="/dashboard/posts" className="text-sm text-gray-500 underline">
            What you&rsquo;re working on
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StartAction objective="SELL" />
          <StartAction objective="TRANSPORT_NEED" />
          <StartAction objective="NEED_REPAIR" />
          <StartAction objective="HIRE_LABOR" />
        </div>
      </div>
    </div>
  );
}

// Colour carries the kind so the eye can sort the list before reading it:
// red is a deadline, amber is somebody waiting, neutral is a suggestion.
const TONE: Record<BriefingItem["kind"], string> = {
  time_critical: "border-l-4 border-l-red-500",
  waiting_on_you: "border-l-4 border-l-amber-500",
  maintenance: "border-l-4 border-l-orange-400",
  anticipation: "border-l-4 border-l-violet-400",
  opportunity: "border-l-4 border-l-accent",
  signal: "border-l-4 border-l-sky-400",
};

function BriefingCard({ item }: { item: BriefingItem }) {
  return (
    <li className={`rounded-xl border border-border bg-card p-4 ${TONE[item.kind]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="mr-2">{item.emoji}</span>
            {item.headline}
          </p>
          {item.detail && <p className="mt-1 text-sm text-gray-500">{item.detail}</p>}
        </div>
        <Link
          href={item.href}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {item.actionLabel}
        </Link>
      </div>
    </li>
  );
}

function StartAction({ objective }: { objective: Objective }) {
  const spec = OBJECTIVES[objective];
  return (
    <Link
      href={`/dashboard/posts?objective=${objective}`}
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-sm hover:border-accent hover:bg-new-bg"
    >
      <span className="text-xl">{spec.emoji}</span>
      <span className="font-medium">{spec.label}</span>
    </Link>
  );
}
