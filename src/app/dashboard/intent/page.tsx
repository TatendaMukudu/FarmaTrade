import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm, type InventoryOption } from "./form";
import { closePost, confirmDraftPost, discardDraftPost } from "./actions";
import { ensureDerivedIntent } from "@/lib/derived-intent";
import { Badge } from "@/components/badge";
import { AddToggle } from "@/components/add-toggle";
import { CATEGORY_LABEL, POST_CATEGORIES } from "@/lib/categories";
import { DIRECTION_LABEL, directionOf } from "@/lib/intent";
import type { PostCategory } from "@/generated/prisma/enums";

// Stored status spelled as what it means commercially. See
// src/lib/intent.ts — the domain says PROPOSED/ACTIVE/ENGAGED/WITHDRAWN and
// this is where those reach a farmer.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Suggested by FarmaTrade",
  OPEN: "Available",
  MATCHED: "In discussion",
  CLOSED: "Closed",
};

const VALID_TYPES = new Set(["HAVE", "NEED"]);
const VALID_CATEGORIES = new Set<string>(POST_CATEGORIES);

export default async function PostsPage({
  searchParams,
}: PageProps<"/dashboard/intent">) {
  const party = await getCurrentParty();
  if (!party) return null;

  if (party.farm) {
    await ensureDerivedIntent(party.farm.id, party);
  }

  const params = await searchParams;
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const defaultType = VALID_TYPES.has(typeParam ?? "") ? (typeParam as "HAVE" | "NEED") : undefined;
  const defaultCategory = VALID_CATEGORIES.has(categoryParam ?? "")
    ? (categoryParam as PostCategory)
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

  const posts = await prisma.post.findMany({
    where: { partyId: party.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { matchesAsA: true, matchesAsB: true } },
      photos: { select: { id: true } },
    },
  });

  const drafts = posts.filter((p) => p.status === "DRAFT");
  const rest = posts.filter((p) => p.status !== "DRAFT");

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

      {drafts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-warning-bg p-4">
          <p className="text-sm font-medium text-warning-fg">
From your farm records — confirm to make available
          </p>
          <ul className="flex flex-col gap-2">
            {drafts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-card border border-border bg-card px-3 py-2"
              >
                <span className="text-sm">{p.title}</span>
                <div className="flex gap-2">
                  <form action={confirmDraftPost}>
                    <input
                      type="hidden"
                      name="id"
                      value={p.id}
                    />
                    <button
                      type="submit"
                      className="rounded-card bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
                    >
                      Confirm
                    </button>
                  </form>
                  <form action={discardDraftPost}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="rounded-card border border-border px-3 py-1 text-xs">
                      Discard
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddToggle label="Add" defaultOpen={!!(defaultType || defaultCategory)}>
        <PostForm
          inventory={inventory}
          countryCode={party.countryCode}
          defaultProvince={party.province}
          defaultDistrict={party.district}
          defaultType={defaultType}
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
                        p.type === "HAVE"
                          ? "text-green-700 dark:text-green-400"
                          : "text-blue-700 dark:text-blue-400"
                      }
                    >
                      {DIRECTION_LABEL[directionOf(p.type)]}
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
                  {p.status === "OPEN" && (
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
        {rest.length === 0 && drafts.length === 0 && (
          <li className="text-sm text-subtle-fg">Nothing recorded yet.</li>
        )}
      </ul>
    </div>
  );
}
