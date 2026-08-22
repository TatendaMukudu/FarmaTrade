import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm, type InventoryOption } from "./form";
import { closePost, confirmProposedIntent, declineProposedIntent } from "./actions";
import { ensureDerivedIntent } from "@/lib/derived-intent";
import { Badge } from "@/components/badge";
import { AddToggle } from "@/components/add-toggle";
import Link from "next/link";
import { CATEGORY_LABEL, COMMERCE_CATEGORIES } from "@/lib/categories";
import { CategoryIcon } from "@/components/icons";
import { SectionHeading, buttonClass } from "@/components/ui";
import { formatQuantity } from "@/lib/units";
import { loadCapacities, type Capacity } from "@/lib/allocation";
import { formatCanonical } from "@/lib/measurement";

// A canonical figure written the way a person writes it.
//
// Rendering only, and it happens after every subtraction rather than
// during: mixing the two is how a display choice turns into a commercial
// one. An intent with no resolvable unit falls back to whatever the owner
// typed, which is still the most honest thing available.
function showQuantity(value: number, capacity: Capacity): string {
  return capacity.basis
    ? formatCanonical(value, capacity.basis)
    : formatQuantity(value, capacity.displayUnit);
}
import { SIDE_LABEL, STATUS_LABEL, canWithdrawIntent } from "@/lib/intent";
import type { CommerceCategory } from "@/generated/prisma/enums";

const VALID_SIDES = new Set(["SUPPLY", "DEMAND"]);
const VALID_CATEGORIES = new Set<string>(COMMERCE_CATEGORIES);

export default async function PostsPage({
  searchParams,
}: PageProps<"/dashboard/trade">) {
  const party = await getCurrentParty();
  if (!party) return null;

  if (party.farm) {
    await ensureDerivedIntent(party.farm.id, party);
  }

  const params = await searchParams;
  const sideParam = Array.isArray(params.side) ? params.side[0] : params.side;
  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const defaultSide = VALID_SIDES.has(sideParam ?? "") ? (sideParam as "SUPPLY" | "DEMAND") : undefined;
  const defaultCategory = VALID_CATEGORIES.has(categoryParam ?? "")
    ? (categoryParam as CommerceCategory)
    : undefined;

  // What this farmer has actually recorded, in their own words. Livestock
  // has no free-text name of its own, so it is described from the fields
  // that do carry the farmer's wording (breed) plus the species.
  const farm = party.farm
    ? await prisma.farm.findUnique({
        where: { id: party.farm.id },
        select: {
          produce: {
            where: { quantity: { gt: 0 } },
            select: { id: true, cropType: true, quantity: true, unit: true },
          },
          livestock: {
            select: { id: true, species: true, breed: true, quantity: true },
          },
          equipment: {
            where: { available: true },
            select: { id: true, name: true },
          },
        },
      })
    : null;

  const inventory: InventoryOption[] = farm
    ? [
        ...farm.produce.map((r) => ({
          ref: `produce:${r.id}`,
          category: "PRODUCE" as const,
          label: r.cropType,
          quantity: r.quantity,
          unit: r.unit,
        })),
        ...farm.livestock.map((r) => ({
          ref: `livestock:${r.id}`,
          category: "LIVESTOCK" as const,
          label: r.breed ? `${r.breed} ${r.species.toLowerCase()}` : r.species.toLowerCase(),
          quantity: r.quantity,
          unit: null,
        })),
        ...farm.equipment.map((r) => ({
          ref: `equipment:${r.id}`,
          category: "EQUIPMENT" as const,
          label: r.name,
          quantity: null,
          unit: null,
        })),
      ]
    : [];

  const intents = await prisma.intent.findMany({
    where: { partyId: party.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { matchesAsA: true, matchesAsB: true } },
      photos: { select: { id: true } },
      // A proposal has to be able to explain itself from the record that
      // produced it.
      produce: {
        select: { cropType: true, quantity: true, unit: true, expectedHarvestDate: true },
      },
    },
  });

  // What each intent still has available, and whether more has been agreed
  // than it now authorizes.
  const capacities = await loadCapacities(intents.map((i) => i.id));

  const proposed = intents.filter((p) => p.status === "PROPOSED");
  const rest = intents.filter((p) => p.status !== "PROPOSED");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Supply &amp; needs</h1>
        <p className="text-sm text-muted-fg">
          What you have available and what you are looking for. FarmaTrade
          matches these against the rest of the network — you never have to
          advertise anything it already knows.
        </p>
      </div>

      {/* Not "draft listings". FarmaTrade watched the farm's state and
          found a moment where it could be useful to somebody else; the
          farmer decides whether it takes part. Each one explains itself
          from the record that produced it. */}
      {proposed.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeading title="Possible supply" count={proposed.length} />
          <p className="text-sm text-muted-fg">
            Found in your farm records. Nothing here is visible to anyone else
            until you make it available.
          </p>
          <ul className="flex flex-col gap-3">
            {proposed.map((p) => (
              <li key={p.id} className="rounded-card border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <CategoryIcon category={p.category} className="mt-0.5 text-muted-fg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      Up to {formatQuantity(p.quantity ?? 0, p.unit)} of {p.produce?.cropType ?? p.title}
                      {p.neededBy && ` from ${p.neededBy.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                    </p>
                    {p.produce && (
                      <p className="mt-1 text-sm text-muted-fg">
                        Based on your recorded {p.produce.cropType.toLowerCase()}:{" "}
                        {formatQuantity(p.produce.quantity, p.produce.unit)} expected
                        {p.produce.expectedHarvestDate &&
                          ` around ${p.produce.expectedHarvestDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        .
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={confirmProposedIntent}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={buttonClass("primary", "sm")}>
                          Make available
                        </button>
                      </form>
                      <Link href={`/dashboard/trade#adjust-${p.id}`} className={buttonClass("secondary", "sm")}>
                        Adjust
                      </Link>
                      <form action={declineProposedIntent}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className={buttonClass("quiet", "sm")}>
                          Not selling this
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddToggle label="Add" defaultOpen={!!(defaultSide || defaultCategory)}>
        <PostForm
          inventory={inventory}
          countryCode={party.countryCode}
          defaultProvince={party.province}
          defaultDistrict={party.district}
          defaultSide={defaultSide}
          defaultCategory={defaultCategory}
        />
      </AddToggle>

      <ul className="flex flex-col gap-3">
        {rest.map((p) => {
          const matchCount = p._count.matchesAsA + p._count.matchesAsB;
          return (
            <li key={p.id} className="rounded-card border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span
                      className={
                        p.side === "SUPPLY"
                          ? "text-green-700 dark:text-green-400"
                          : "text-blue-700 dark:text-blue-400"
                      }
                    >
                      {SIDE_LABEL[p.side]}
                    </span>{" "}
                    · {p.title}
                  </p>
                  <p className="text-sm text-muted-fg">
                    {CATEGORY_LABEL[p.category]} · {p.district}, {p.province}
                    {p.destinationDistrict &&
                      p.destinationProvince &&
                      ` → ${p.destinationDistrict}, ${p.destinationProvince}`}
                    {" · "}
                    {STATUS_LABEL[p.status] ?? p.status}
                    {p.urgent && (
                      <Badge tone="warning" className="ml-2">
                        Time-sensitive
                      </Badge>
                    )}
                    {p.recurring && (
                      <Badge tone="info" className="ml-2">
                        Standing order
                      </Badge>
                    )}
                    {p.neededBy && ` · needed by ${p.neededBy.toLocaleDateString()}`}
                    {p.travelDate && ` · travelling ${p.travelDate.toLocaleDateString()}`}
                  </p>
                  {(() => {
                    const capacity = capacities.get(p.id);
                    if (!capacity) return null;
                    return (
                      <>
                        {capacity.remaining != null && capacity.authorized != null && (
                          <p className="mt-1 text-sm text-muted-fg">
                            {/* Canonical figures rendered in the canonical
                                unit's own word. The arithmetic happened in
                                kilograms; this is only how it is written
                                down, and the two are deliberately separate
                                steps. */}
                            {showQuantity(capacity.remaining, capacity)} of{" "}
                            {showQuantity(capacity.authorized, capacity)} still available
                          </p>
                        )}
                        {/* Why some of the engagements on this intent could
                            not be counted, said specifically. "Bags cannot
                            be weighed" is actionable; "some engagements are
                            unquantified" is not. */}
                        {capacity.unmeasured.context_required > 0 && (
                          <p className="mt-1 text-sm text-muted-fg">
                            {capacity.unmeasured.context_required} agreed in packaging units.
                            FarmaTrade cannot tell how much a bag or crate weighs, so those are
                            not counted above.
                          </p>
                        )}
                        {capacity.unmeasured.unknown_unit > 0 && (
                          <p className="mt-1 text-sm text-muted-fg">
                            {capacity.unmeasured.unknown_unit} agreed in a unit FarmaTrade does not
                            recognise, so those are not counted above.
                          </p>
                        )}
                        {capacity.unmeasured.incompatible_dimension > 0 && (
                          <p className="mt-1 text-sm text-muted-fg">
                            {capacity.unmeasured.incompatible_dimension} agreed in a unit that
                            measures something else entirely, so those are not counted above.
                          </p>
                        )}
                        {/* Said plainly rather than hidden behind a
                            remaining figure of zero. More is agreed than is
                            now offered, and the people on the other end of
                            those agreements are counting on it. FarmaTrade
                            will not reduce them on the farmer's behalf, and
                            will not pretend the numbers add up. */}
                        {capacity.overcommitted > 0 && (
                          <p className="mt-1 text-sm text-warning-fg">
                            You have agreed{" "}
                            {showQuantity(capacity.overcommitted, capacity)} more than this
                            now offers. Nothing has been changed for you — open the agreements
                            below to settle which one moves.
                          </p>
                        )}
                      </>
                    );
                  })()}
                  {p.description && (
                    <p className="mt-1 text-sm text-muted-fg">{p.description}</p>
                  )}
                  {p.photos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {p.photos.map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={photo.id}
                          src={`/api/photos/${photo.id}`}
                          alt=""
                          className="h-16 w-16 rounded-control object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs whitespace-nowrap text-subtle-fg">
                    {matchCount} match{matchCount === 1 ? "" : "es"}
                  </span>
                  {canWithdrawIntent(p.status) && (
                    <form action={closePost}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 underline"
                      >
                        Close
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {rest.length === 0 && proposed.length === 0 && (
          <li className="text-sm text-subtle-fg">Nothing recorded yet.</li>
        )}
      </ul>
    </div>
  );
}
