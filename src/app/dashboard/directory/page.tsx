import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { summarizeReputation, buildTrustProfile } from "@/lib/reputation";
import { CAPABILITY_LABEL, CAPABILITY_EMOJI, ALL_CAPABILITIES } from "@/lib/capabilities";
import { Badge } from "@/components/badge";
import type { Capability, Reputation } from "@/generated/prisma/client";

// The capabilities worth a one-tap filter. Not all seventeen — a filter row
// long enough to wrap twice on a phone stops being a filter and becomes a
// second navigation menu. The rest are reachable via ?capability=.
const FILTER_CAPABILITIES: Capability[] = [
  "FARMER",
  "BUYER",
  "SUPPLIER",
  "TRANSPORTER",
  "MECHANIC",
  "COLD_STORAGE",
  "LABOR_PROVIDER",
];

export default async function DirectoryPage({
  searchParams,
}: PageProps<"/dashboard/directory">) {
  const params = await searchParams;
  const raw = Array.isArray(params.capability) ? params.capability[0] : params.capability;
  const capability = ALL_CAPABILITIES.includes(raw as Capability)
    ? (raw as Capability)
    : undefined;

  const currentParty = await getCurrentParty();

  const [parties, relations] = await Promise.all([
    prisma.party.findMany({
      where: {
        id: { not: currentParty?.id },
        ...(capability ? { capabilities: { has: capability } } : {}),
      },
      include: { farm: true, transportProfile: true, reputation: true },
      orderBy: [
        // Repeat business first: the platform's own strongest trust signal
        // should decide who a farmer sees before a star average does.
        { reputation: { repeatPartnerCount: "desc" } },
        { reputation: { averageRating: "desc" } },
        { createdAt: "desc" },
      ],
      take: 100,
    }),
    currentParty
      ? prisma.relation.findMany({
          where: { OR: [{ partyAId: currentParty.id }, { partyBId: currentParty.id }] },
        })
      : Promise.resolve([]),
  ]);

  const strengthByCounterparty = new Map<string, number>();
  for (const r of relations) {
    const counterpartyId = r.partyAId === currentParty?.id ? r.partyBId : r.partyAId;
    strengthByCounterparty.set(counterpartyId, r.strength);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Your network</h1>
        <p className="text-sm text-gray-500">
          Everyone you can do business with — ranked by who others keep coming back to.
        </p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <FilterChip label="Everyone" href="/dashboard/directory" active={!capability} />
        {FILTER_CAPABILITIES.map((c) => (
          <FilterChip
            key={c}
            label={`${CAPABILITY_EMOJI[c]} ${CAPABILITY_LABEL[c]}`}
            href={`/dashboard/directory?capability=${c}`}
            active={c === capability}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {parties.map((p) => {
          const strength = strengthByCounterparty.get(p.id);
          const trust = buildTrustProfile(p.reputation);
          return (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/directory/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.verifiedBy && <VerifiedBadge source={p.verifiedBy} />}
                    {strength != null && strength >= 2 && (
                      <Badge tone="info">Traded {strength}×</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-gray-500">
                    {p.district}, {p.province}
                    {p.operatingRadiusKm ? ` · travels ${p.operatingRadiusKm}km` : ""}
                  </p>

                  {p.capabilities.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.capabilities.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-new-bg px-2 py-0.5 text-xs text-new-fg"
                        >
                          {CAPABILITY_EMOJI[c]} {CAPABILITY_LABEL[c]}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* The three lines that actually decide whether someone
                      picks up the phone: what this party is known for, how
                      many partners came back, and how fast they reply. */}
                  <div className="mt-2 flex flex-col gap-0.5 text-xs text-gray-500">
                    {trust.headline && <span>⭐ {trust.headline}</span>}
                    {trust.repeatPartnerLine && <span>🔁 {trust.repeatPartnerLine}</span>}
                    {trust.responseLine && <span>💬 {trust.responseLine}</span>}
                  </div>
                </div>

                <ReputationBadge reputation={p.reputation} />
              </div>
            </li>
          );
        })}
        {parties.length === 0 && (
          <li className="text-sm text-gray-400">
            Nobody here yet with that capability.
          </li>
        )}
      </ul>
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
        active ? "border-accent bg-accent text-accent-foreground" : "border-border"
      }`}
    >
      {label}
    </Link>
  );
}

function VerifiedBadge({ source }: { source: "FOUNDER" | "NETWORK" }) {
  return (
    <Badge tone="success">{source === "FOUNDER" ? "✓ Founder-vouched" : "✓ Network-referred"}</Badge>
  );
}

function ReputationBadge({ reputation }: { reputation: Reputation | null }) {
  const summary = summarizeReputation(reputation);
  const toneClasses =
    summary.tone === "success" ? "bg-success-bg text-success-fg" : "bg-new-bg text-new-fg";
  return (
    <div className="shrink-0 text-right">
      <p
        className={`inline-block rounded-full whitespace-nowrap font-semibold ${toneClasses} ${
          summary.hasStars ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-xs font-medium"
        }`}
      >
        {summary.headline}
      </p>
      {summary.hasHistory && <p className="mt-1 text-xs text-gray-500">{summary.completedLine}</p>}
    </div>
  );
}
