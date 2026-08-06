import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeReputation, buildTrustProfile } from "@/lib/reputation";
import { CAPABILITY_LABEL, CAPABILITY_EMOJI } from "@/lib/capabilities";
import { Badge } from "@/components/badge";
import type { TrustProfile } from "@/lib/trust-core";

export default async function PartyProfilePage({
  params,
}: PageProps<"/dashboard/directory/[partyId]">) {
  const { partyId } = await params;
  const currentParty = await getCurrentParty();

  const [party, relation] = await Promise.all([
    prisma.party.findUnique({
      where: { id: partyId },
      include: {
        farm: {
          include: {
            _count: { select: { livestock: true, produce: true, equipment: true } },
          },
        },
        transportProfile: true,
        reputation: true,
      },
    }),
    currentParty
      ? prisma.relation.findFirst({
          where: {
            OR: [
              { partyAId: currentParty.id, partyBId: partyId },
              { partyAId: partyId, partyBId: currentParty.id },
            ],
          },
        })
      : Promise.resolve(null),
  ]);

  if (!party) notFound();

  const reputation = summarizeReputation(party.reputation);
  const trust = buildTrustProfile(party.reputation);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/directory" className="text-sm text-gray-500 underline">
        ← Back to directory
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{party.name}</h1>
            {party.verifiedBy && (
              <Badge tone="success">
                {party.verifiedBy === "FOUNDER" ? "✓ Founder-vouched" : "✓ Network-referred"}
              </Badge>
            )}
            {relation && relation.strength >= 2 && (
              <Badge tone="info">Preferred partner · {relation.strength} completed</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {party.district}, {party.province}
            {party.operatingRadiusKm ? ` · travels up to ${party.operatingRadiusKm}km` : ""}
            {party.yearsExperience ? ` · ${party.yearsExperience} years in business` : ""}
          </p>
          {party.capabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {party.capabilities.map((c) => (
                <span key={c} className="rounded-full bg-new-bg px-2 py-0.5 text-xs text-new-fg">
                  {CAPABILITY_EMOJI[c]} {CAPABILITY_LABEL[c]}
                </span>
              ))}
            </div>
          )}
          {party.languages.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">Speaks {party.languages.join(", ")}</p>
          )}
          {party.availabilityNote && (
            <p className="mt-1 text-xs text-gray-500">🕑 {party.availabilityNote}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`inline-block rounded-full whitespace-nowrap font-semibold ${
              reputation.tone === "success" ? "bg-success-bg text-success-fg" : "bg-new-bg text-new-fg"
            } ${reputation.hasStars ? "px-3 py-1 text-xl" : "px-2 py-0.5 text-xs font-medium"}`}
          >
            {reputation.headline}
          </p>
          {reputation.hasHistory && <p className="mt-1 text-xs text-gray-500">{reputation.completedLine}</p>}
        </div>
      </div>

      <TrustBreakdown trust={trust} />

      {party.licenses.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-gray-500">Licences & registrations</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600">
            {party.licenses.map((l) => (
              <li key={l}>📄 {l}</li>
            ))}
          </ul>
        </div>
      )}

      {party.farm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">{party.farm.farmName}</p>
          {party.farm.sizeHectares && (
            <p className="text-sm text-gray-500">{party.farm.sizeHectares} ha</p>
          )}
          <p className="mt-2 text-sm text-gray-600">
            {party.farm._count.livestock} livestock record{party.farm._count.livestock === 1 ? "" : "s"} ·{" "}
            {party.farm._count.produce} produce record{party.farm._count.produce === 1 ? "" : "s"} ·{" "}
            {party.farm._count.equipment} equipment record{party.farm._count.equipment === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {party.transportProfile && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-gray-600">
          {party.transportProfile.vehicleType}
          {party.transportProfile.capacityKg ? ` · ${party.transportProfile.capacityKg}kg capacity` : ""}
          {party.transportProfile.serviceRegion ? ` · serves ${party.transportProfile.serviceRegion}` : ""}
        </div>
      )}

      {(party.phone || party.contactDetails) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-gray-500">Contact</p>
          {party.phone && <p className="font-medium">{party.phone}</p>}
          {party.contactDetails && (
            <p className="mt-1 text-sm whitespace-pre-line text-gray-600">{party.contactDetails}</p>
          )}
        </div>
      )}
    </div>
  );
}

// The shape of someone's track record, not just its size. A bar per
// dimension is the whole point of the multidimensional model: it lets a
// reader see "excellent quality, slow to pay" at a glance, which a single
// 4.1★ actively hides.
function TrustBreakdown({ trust }: { trust: TrustProfile }) {
  if (!trust.hasDimensions && !trust.repeatPartnerLine && !trust.responseLine) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-gray-500">Track record</p>

      <div className="mt-2 flex flex-col gap-1 text-sm">
        {trust.repeatPartnerLine && <p>🔁 {trust.repeatPartnerLine}</p>}
        {trust.responseLine && <p>💬 {trust.responseLine}</p>}
      </div>

      {trust.hasDimensions && (
        <div className="mt-4 flex flex-col gap-2">
          {trust.strengths.map((d) => (
            <div key={d.dimension} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-gray-500">{d.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-accent" style={{ width: `${(d.average / 5) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-xs text-gray-500">
                {d.average.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {trust.watchouts.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Relatively weaker on {trust.watchouts.map((w) => w.label.toLowerCase()).join(", ")} —
          worth agreeing terms up front.
        </p>
      )}
    </div>
  );
}
