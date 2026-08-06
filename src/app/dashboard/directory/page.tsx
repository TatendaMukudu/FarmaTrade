import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { summarizeReputation } from "@/lib/reputation";
import { Badge } from "@/components/badge";
import type { PartyRole, Reputation } from "@/generated/prisma/client";

const ROLE_FILTERS: { label: string; value: PartyRole | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Farms", value: "FARM" },
  { label: "Traders", value: "TRADER" },
  { label: "Transporters", value: "TRANSPORTER" },
];

export default async function DirectoryPage({
  searchParams,
}: PageProps<"/dashboard/directory">) {
  const params = await searchParams;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const role = (roleParam as PartyRole | undefined) ?? undefined;

  const currentParty = await getCurrentParty();

  const [parties, relations] = await Promise.all([
    prisma.party.findMany({
      where: {
        id: { not: currentParty?.id },
        ...(role ? { roles: { has: role } } : {}),
      },
      include: {
        farm: true,
        transportProfile: true,
        reputation: true,
      },
      orderBy: [{ reputation: { averageRating: "desc" } }, { createdAt: "desc" }],
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
        <h1 className="text-2xl font-semibold">Directory</h1>
        <p className="text-sm text-gray-500">
          Buyers, sellers, and transport providers, ranked by reputation.
        </p>
      </div>

      <div className="flex gap-2">
        {ROLE_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "ALL" ? "/dashboard/directory" : `/dashboard/directory?role=${f.value}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              (f.value === "ALL" && !role) || f.value === role
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {parties.map((p) => {
          const strength = strengthByCounterparty.get(p.id);
          return (
            <li key={p.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/directory/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {p.verifiedBy && <VerifiedBadge source={p.verifiedBy} />}
                    {strength && strength >= 2 && <Badge tone="info">Preferred partner</Badge>}
                  </div>
                  <p className="text-sm text-gray-500">
                    {p.district}, {p.province} · {p.roles.join(", ")}
                  </p>
                  {p.farm && (
                    <p className="text-sm text-gray-500">Farm: {p.farm.farmName}</p>
                  )}
                  {p.transportProfile && (
                    <p className="text-sm text-gray-500">
                      {p.transportProfile.vehicleType}
                      {p.transportProfile.capacityKg
                        ? ` · ${p.transportProfile.capacityKg}kg capacity`
                        : ""}
                    </p>
                  )}
                </div>
                <ReputationBadge reputation={p.reputation} />
              </div>
            </li>
          );
        })}
        {parties.length === 0 && (
          <li className="text-sm text-gray-400">No parties found yet.</li>
        )}
      </ul>
    </div>
  );
}

function VerifiedBadge({ source }: { source: "FOUNDER" | "NETWORK" }) {
  return <Badge tone="success">{source === "FOUNDER" ? "✓ Founder-vouched" : "✓ Network-referred"}</Badge>;
}

function ReputationBadge({ reputation }: { reputation: Reputation | null }) {
  const summary = summarizeReputation(reputation);
  const toneClasses = summary.tone === "success" ? "bg-success-bg text-success-fg" : "bg-new-bg text-new-fg";
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
