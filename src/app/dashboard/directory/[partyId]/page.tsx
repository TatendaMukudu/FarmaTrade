import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeReputation } from "@/lib/reputation";
import { Badge } from "@/components/badge";

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

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/directory" className="text-sm text-gray-500 underline">
        ← Back to directory
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{party.name}</h1>
            {party.verifiedBy && (
              <Badge tone="green">
                {party.verifiedBy === "FOUNDER" ? "✓ Founder-vouched" : "✓ Network-referred"}
              </Badge>
            )}
            {relation && relation.strength >= 2 && (
              <Badge tone="blue">Preferred partner · {relation.strength} completed</Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {party.district}, {party.province} · {party.roles.join(", ")}
          </p>
        </div>

        {reputation.hasHistory ? (
          <div className="text-right">
            <p
              className={
                reputation.hasStars
                  ? "text-3xl leading-none font-semibold text-amber-500"
                  : "text-sm font-medium text-gray-600"
              }
            >
              {reputation.headline}
            </p>
            <p className="mt-1 text-xs text-gray-500">{reputation.completedLine}</p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">{reputation.headline}</p>
        )}
      </div>

      {party.farm && (
        <div className="rounded border p-4">
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
        <div className="rounded border p-4 text-sm text-gray-600">
          {party.transportProfile.vehicleType}
          {party.transportProfile.capacityKg ? ` · ${party.transportProfile.capacityKg}kg capacity` : ""}
          {party.transportProfile.serviceRegion ? ` · serves ${party.transportProfile.serviceRegion}` : ""}
        </div>
      )}

      {party.phone && (
        <div className="rounded border p-4">
          <p className="text-xs text-gray-500">Contact</p>
          <p className="font-medium">{party.phone}</p>
        </div>
      )}
    </div>
  );
}
