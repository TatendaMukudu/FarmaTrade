import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm } from "./form";
import { closePost, confirmDraftPost, discardDraftPost } from "./actions";
import { ensureHarvestDrafts } from "@/lib/harvest-drafts";
import { Badge } from "@/components/badge";
import { AddToggle } from "@/components/add-toggle";
import { CATEGORY_LABEL, POST_CATEGORIES } from "@/lib/categories";
import type { PostCategory } from "@/generated/prisma/enums";

const VALID_TYPES = new Set(["HAVE", "NEED"]);
const VALID_CATEGORIES = new Set<string>(POST_CATEGORIES);

export default async function PostsPage({
  searchParams,
}: PageProps<"/dashboard/posts">) {
  const party = await getCurrentParty();
  if (!party) return null;

  if (party.farm) {
    await ensureHarvestDrafts(party.farm.id, party);
  }

  const params = await searchParams;
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const defaultType = VALID_TYPES.has(typeParam ?? "") ? (typeParam as "HAVE" | "NEED") : undefined;
  const defaultCategory = VALID_CATEGORIES.has(categoryParam ?? "")
    ? (categoryParam as PostCategory)
    : undefined;

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
        <h1 className="text-2xl font-semibold">Your posts</h1>
        <p className="text-sm text-muted-fg">
          Say what you have or what you need — FarmaTrade matches it against
          the opposite side automatically.
        </p>
      </div>

      {drafts.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-warning-bg p-4">
          <p className="text-sm font-medium text-warning-fg">
            Drafted from your upcoming harvest — confirm to publish
          </p>
          <ul className="flex flex-col gap-2">
            {drafts.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2"
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
                      className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
                    >
                      Confirm &amp; publish
                    </button>
                  </form>
                  <form action={discardDraftPost}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="rounded-lg border border-border px-3 py-1 text-xs">
                      Discard
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AddToggle label="New post" defaultOpen={!!(defaultType || defaultCategory)}>
        <PostForm
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
            <li key={p.id} className="rounded-lg border border-border bg-card p-4">
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
                      {p.type === "HAVE" ? "I have" : "I need"}
                    </span>{" "}
                    · {p.title}
                  </p>
                  <p className="text-sm text-muted-fg">
                    {CATEGORY_LABEL[p.category]} · {p.district}, {p.province}
                    {p.destinationDistrict &&
                      p.destinationProvince &&
                      ` → ${p.destinationDistrict}, ${p.destinationProvince}`}
                    {" · "}
                    {p.status}
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
                          className="h-16 w-16 rounded object-cover"
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
          <li className="text-sm text-subtle-fg">No posts yet.</li>
        )}
      </ul>
    </div>
  );
}
