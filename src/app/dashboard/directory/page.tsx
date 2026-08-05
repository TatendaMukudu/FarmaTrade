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

export default async function DirectoryPage({
  searchParams,
}: PageProps<"/dashboard/directory">) {
  const params = await searchParams;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const role = (roleParam as PartyRole | undefined) ?? undefined;

  const currentParty = await getCurrentParty();

  const parties = await prisma.party.findMany({
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
  });

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
        {parties.map((p) => (
          <li key={p.id} className="rounded border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.name}</p>
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
        ))}
        {parties.length === 0 && (
          <li className="text-sm text-gray-400">No parties found yet.</li>
        )}
      </ul>
    </div>
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
  return (
    <div className="text-right text-xs text-gray-500">
      <p>
        {reputation.averageRating
          ? `★ ${reputation.averageRating.toFixed(1)} (${reputation.ratingCount})`
          : "Not yet rated"}
      </p>
      <p>{reputation.completedCount} completed</p>
    </div>
  );
}
