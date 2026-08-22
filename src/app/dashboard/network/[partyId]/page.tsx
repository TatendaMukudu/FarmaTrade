import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadNetworkParty } from "@/lib/network-data";
import { summarizeReputation } from "@/lib/reputation";
import { canSeeContactDetails } from "@/lib/identity-safety";
import { Badge } from "@/components/badge";

export default async function PartyProfilePage({
  params,
}: PageProps<"/dashboard/network/[partyId]">) {
  const { partyId } = await params;
  const currentParty = await getCurrentParty();

  const [party, relation] = await Promise.all([
    loadNetworkParty(partyId),
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

  // PRODUCT_TRUTH.md §29 / INV-14. The rule lives in identity-safety.ts
  // because it is product truth, not presentation — a page that decides for
  // itself who may see a phone number is a page that can be copied without
  // the rule.
  const engaged = await canSeeContactDetails(currentParty?.id, partyId);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/network" className="text-sm text-muted-fg underline">
        ← Back to network
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
          <p className="text-sm text-muted-fg">
            {party.district}, {party.province} · {party.roles.join(", ")}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={`inline-block rounded-pill whitespace-nowrap font-semibold ${
              reputation.tone === "success" ? "bg-success-bg text-success-fg" : "bg-new-bg text-new-fg"
            } ${reputation.hasStars ? "px-3 py-1 text-xl" : "px-2 py-0.5 text-xs font-medium"}`}
          >
            {reputation.headline}
          </p>
          {reputation.hasHistory && <p className="mt-1 text-xs text-muted-fg">{reputation.completedLine}</p>}
        </div>
      </div>

      {party.farm && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="font-medium">{party.farm.farmName}</p>
          {party.farm.sizeHectares && (
            <p className="text-sm text-muted-fg">{party.farm.sizeHectares} ha</p>
          )}
          <p className="mt-2 text-sm text-muted-fg">
            {party.farm._count.livestock} livestock record{party.farm._count.livestock === 1 ? "" : "s"} ·{" "}
            {party.farm._count.produce} produce record{party.farm._count.produce === 1 ? "" : "s"} ·{" "}
            {party.farm._count.equipment} equipment record{party.farm._count.equipment === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {party.transportProfile && (
        <div className="rounded-card border border-border bg-card p-4 text-sm text-muted-fg">
          {party.transportProfile.vehicleType}
          {party.transportProfile.capacityKg ? ` · ${party.transportProfile.capacityKg}kg capacity` : ""}
          {party.transportProfile.serviceRegion ? ` · serves ${party.transportProfile.serviceRegion}` : ""}
        </div>
      )}

      {engaged && (party.phone || party.contactDetails) && (
        <div className="rounded-card border border-border bg-card p-4">
          <p className="text-xs text-muted-fg">Contact</p>
          {party.phone && <p className="font-medium">{party.phone}</p>}
          {party.contactDetails && (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-fg">{party.contactDetails}</p>
          )}
        </div>
      )}
      {!engaged && (party.phone || party.contactDetails) && (
        <p className="text-xs text-subtle-fg">
          Contact details become available once you and {party.name} have agreed a trade.
        </p>
      )}
    </div>
  );
}
