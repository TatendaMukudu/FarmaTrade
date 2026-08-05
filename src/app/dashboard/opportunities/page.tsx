import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import type { Post, Party } from "@/generated/prisma/client";

export default async function OpportunitiesPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const matches = await prisma.match.findMany({
    where: {
      status: { in: ["SUGGESTED", "ACCEPTED"] },
      OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
    },
    include: {
      postA: { include: { party: true } },
      postB: { include: { party: true } },
    },
    orderBy: { score: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm text-gray-500">
          Matches FarmaTrade found between your posts and the opposite side.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {matches.map((m) => {
          const yours = m.postA.partyId === party.id ? m.postA : m.postB;
          const theirs = m.postA.partyId === party.id ? m.postB : m.postA;
          return (
            <li key={m.id} className="rounded border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-400">
                    Score {m.score} · {m.status}
                  </p>
                  <p className="mt-1 font-medium">
                    Your post: {yours.title}
                  </p>
                  <MatchCounterpart post={theirs} />
                </div>
                {m.status === "SUGGESTED" && (
                  <form action={respondToMatch} className="flex gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      name="decision"
                      value="ACCEPTED"
                      className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Accept
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="DECLINED"
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      Decline
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
        {matches.length === 0 && (
          <li className="text-sm text-gray-400">
            No opportunities yet — post what you have or need to get matched.
          </li>
        )}
      </ul>
    </div>
  );
}

function MatchCounterpart({ post }: { post: Post & { party: Party } }) {
  return (
    <p className="text-sm text-gray-600">
      {post.party.name} {post.type === "HAVE" ? "has" : "needs"}: {post.title}{" "}
      <span className="text-gray-400">
        ({post.district}, {post.province})
      </span>
    </p>
  );
}
