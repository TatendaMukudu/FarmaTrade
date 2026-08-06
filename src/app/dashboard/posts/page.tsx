import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PostForm } from "./form";
import { closePost } from "./actions";

const VALID_TYPES = new Set(["HAVE", "NEED"]);
const VALID_CATEGORIES = new Set(["LIVESTOCK", "PRODUCE", "EQUIPMENT", "TRANSPORT"]);

export default async function PostsPage({
  searchParams,
}: PageProps<"/dashboard/posts">) {
  const party = await getCurrentParty();
  if (!party) return null;

  const params = await searchParams;
  const typeParam = Array.isArray(params.type) ? params.type[0] : params.type;
  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const defaultType = VALID_TYPES.has(typeParam ?? "") ? (typeParam as "HAVE" | "NEED") : undefined;
  const defaultCategory = VALID_CATEGORIES.has(categoryParam ?? "")
    ? (categoryParam as "LIVESTOCK" | "PRODUCE" | "EQUIPMENT" | "TRANSPORT")
    : undefined;

  const posts = await prisma.post.findMany({
    where: { partyId: party.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { matchesAsA: true, matchesAsB: true } },
      photos: { select: { id: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Your posts</h1>
        <p className="text-sm text-gray-500">
          Say what you have or what you need — FarmaTrade matches it against
          the opposite side automatically.
        </p>
      </div>

      <PostForm
        defaultProvince={party.province}
        defaultDistrict={party.district}
        defaultType={defaultType}
        defaultCategory={defaultCategory}
      />

      <ul className="flex flex-col gap-3">
        {posts.map((p) => {
          const matchCount = p._count.matchesAsA + p._count.matchesAsB;
          return (
            <li key={p.id} className="rounded border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    <span
                      className={
                        p.type === "HAVE" ? "text-green-700" : "text-blue-700"
                      }
                    >
                      {p.type === "HAVE" ? "I have" : "I need"}
                    </span>{" "}
                    · {p.title}
                  </p>
                  <p className="text-sm text-gray-500">
                    {p.category} · {p.district}, {p.province} · {p.status}
                    {p.urgent && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Time-sensitive
                      </span>
                    )}
                    {p.neededBy && ` · needed by ${p.neededBy.toLocaleDateString()}`}
                  </p>
                  {p.description && (
                    <p className="mt-1 text-sm text-gray-600">{p.description}</p>
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
                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-gray-400">
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
        {posts.length === 0 && (
          <li className="text-sm text-gray-400">No posts yet.</li>
        )}
      </ul>
    </div>
  );
}
