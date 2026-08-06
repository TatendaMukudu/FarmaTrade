import { getCurrentParty } from "@/lib/auth";
import { getFreshSignals } from "@/lib/signals";
import { MIN_SAMPLE } from "@/lib/signals-core";
import { categoryEmoji, CATEGORY_LABEL } from "@/lib/categories";
import { Badge } from "@/components/badge";
import type { SignalKind } from "@/generated/prisma/enums";

// Every signal is shown with the sample size it came from. A platform that
// tells farmers "demand is up 60%" without saying it saw eight posts is
// asking them to bet a season on a rumour — and the first time that's wrong
// they stop believing the page entirely.
const TONE: Record<SignalKind, "success" | "warning" | "info" | "new"> = {
  DEMAND_RISING: "success",
  DEMAND_FALLING: "warning",
  SUPPLY_TIGHT: "success",
  SUPPLY_GLUT: "warning",
  TRANSPORT_SCARCE: "warning",
  TRANSPORT_AVAILABLE: "success",
  PRICE_RISING: "success",
  PRICE_FALLING: "warning",
};

function confidenceLabel(strength: number, sampleSize: number): string {
  if (sampleSize < MIN_SAMPLE * 2) return "Early signal";
  if (strength >= 0.7) return "Strong signal";
  if (strength >= 0.45) return "Moderate signal";
  return "Weak signal";
}

export default async function MarketPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const { local, national, total } = await getFreshSignals(party.province);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Market</h1>
        <p className="text-sm text-gray-500">
          What FarmaTrade is seeing across the network — computed from real
          buying and selling activity, not a price list.
        </p>
      </div>

      <Section
        title={`In ${party.province}`}
        empty="Not enough activity in your province yet to say anything useful."
        signals={local}
      />

      <Section
        title="Across Zimbabwe"
        empty="Not enough activity across the network yet."
        signals={national}
      />

      {total === 0 && (
        <p className="text-sm text-gray-400">
          Market signals appear once there&rsquo;s enough trading activity to
          measure. Every listing posted makes this page more accurate.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  signals,
}: {
  title: string;
  empty: string;
  signals: {
    id: string;
    kind: SignalKind;
    category: string;
    headline: string;
    detail: string;
    strength: number;
    sampleSize: number;
  }[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      {signals.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {signals.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2">
                      {categoryEmoji(s.category as keyof typeof CATEGORY_LABEL)}
                    </span>
                    {s.headline}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">{s.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={TONE[s.kind]}>{confidenceLabel(s.strength, s.sampleSize)}</Badge>
                  <p className="mt-1 text-xs text-gray-400">from {s.sampleSize} posts</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
