import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import type { PartyRole } from "@/generated/prisma/client";

const ROLE_FILTERS: { label: string; value: PartyRole | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Farms", value: "FARM" },
  { label: "Traders", value: "TRADER" },
  { label: "Transporters", value: "TRANSPORTER" },
];

// A star average needs enough samples to mean anything — below this, a
// single 5★ rating would display with false precision. Show the raw count
// instead until there's a real signal.
const MIN_RATINGS_FOR_AVERAGE = 3;

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
                ? "bg-black text-white"
                : ""
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
            <li key={p.id} className="rounded border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    {p.verifiedBy && <VerifiedBadge source={p.verifiedBy} />}
                    {strength && strength >= 2 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Preferred partner
                      </span>
                    )}
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
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      {source === "FOUNDER" ? "✓ Founder-vouched" : "✓ Network-referred"}
    </span>
  );
}

function ReputationBadge({
  reputation,
}: {
  reputation: {
    completedCount: number;
    averageRating: number | null;
    ratingCount: number;
  } | null;
}) {
  if (!reputation || reputation.completedCount === 0) {
    return <span className="text-xs text-gray-400">New · no history yet</span>;
  }
  const hasEnoughRatings =
    reputation.averageRating !== null && reputation.ratingCount >= MIN_RATINGS_FOR_AVERAGE;
  return (
    <div className="text-right text-xs text-gray-500">
      <p>
        {hasEnoughRatings
          ? `★ ${reputation.averageRating!.toFixed(1)} (${reputation.ratingCount})`
          : reputation.ratingCount > 0
            ? `Building history (${reputation.ratingCount} rating${reputation.ratingCount === 1 ? "" : "s"})`
            : "Not yet rated"}
      </p>
      <p>{reputation.completedCount} completed</p>
    </div>
  );
}
