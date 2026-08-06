import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import { ConfirmForm } from "./confirm-form";
import type { Post, Party, Reputation, Photo } from "@/generated/prisma/client";

const MIN_RATINGS_FOR_AVERAGE = 3;

type PartyWithReputation = Party & { reputation: Reputation | null };

export default async function OpportunitiesPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  const [active, history, relations] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: { in: ["SUGGESTED", "ACCEPTED"] },
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
      include: {
        postA: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        postB: {
          include: { party: { include: { reputation: true } }, photos: { select: { id: true } } },
        },
        confirmations: true,
      },
      orderBy: { score: "desc" },
    }),
    prisma.match.findMany({
      where: {
        status: "COMPLETED",
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
      include: {
        postA: { include: { party: true } },
        postB: { include: { party: true } },
        confirmations: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.relation.findMany({
      where: { OR: [{ partyAId: party.id }, { partyBId: party.id }] },
    }),
  ]);

  const strengthByCounterparty = new Map<string, number>();
  for (const r of relations) {
    const counterpartyId = r.partyAId === party.id ? r.partyBId : r.partyAId;
    strengthByCounterparty.set(counterpartyId, r.strength);
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm text-gray-500">
          Matches FarmaTrade found between your posts and the opposite side.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {active.map((m) => {
          const yours = m.postA.partyId === party.id ? m.postA : m.postB;
          const theirs = m.postA.partyId === party.id ? m.postB : m.postA;
          const myConfirmation = m.confirmations.find(
            (c) => c.partyId === party.id,
          );
          const strength = strengthByCounterparty.get(theirs.party.id);
          return (
            <li key={m.id} className="rounded border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{m.status}</span>
                    {(yours.urgent || theirs.urgent) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                        Time-sensitive
                      </span>
                    )}
                    {strength && strength >= 2 && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                        Preferred partner · {strength} completed
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-medium">Your post: {yours.title}</p>
                  <MatchCounterpart post={theirs} myDistrict={party.district} myProvince={party.province} />
                  {m.reasons.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      Why: {m.reasons.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
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
                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/conversations/${m.id}`}
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      Message
                    </Link>
                    <Link
                      href={`/dashboard/directory/${theirs.party.id}`}
                      className="rounded border px-3 py-1.5 text-xs"
                    >
                      View profile
                    </Link>
                  </div>
                </div>
              </div>
              {m.status === "ACCEPTED" && (
                <div className="mt-4 border-t pt-4">
                  {myConfirmation ? (
                    <p className="text-sm text-gray-500">
                      You reported: {myConfirmation.outcome.replace(/_/g, " ")}.
                      Waiting on {theirs.party.name} to confirm their side.
                    </p>
                  ) : (
                    <ConfirmForm matchId={m.id} counterpartyName={theirs.party.name} />
                  )}
                </div>
              )}
            </li>
          );
        })}
        {active.length === 0 && (
          <li className="text-sm text-gray-400">
            No opportunities yet — post what you have or need to get matched.
          </li>
        )}
      </ul>

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">History</h2>
          <ul className="flex flex-col gap-2">
            {history.map((m) => {
              const yours = m.postA.partyId === party.id ? m.postA : m.postB;
              const theirs = m.postA.partyId === party.id ? m.postB : m.postA;
              const myConfirmation = m.confirmations.find(
                (c) => c.partyId === party.id,
              );
              return (
                <li
                  key={m.id}
                  className="rounded border px-4 py-2 text-sm text-gray-600"
                >
                  {yours.title} ↔ {theirs.party.name} ({theirs.title}) ·{" "}
                  {myConfirmation?.outcome.replace(/_/g, " ") ?? "—"}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function distanceLabel(theirDistrict: string, theirProvince: string, myDistrict: string, myProvince: string) {
  if (theirDistrict === myDistrict) return "Same district";
  if (theirProvince === myProvince) return "Same province";
  return theirProvince;
}

function reputationLabel(reputation: Reputation | null) {
  if (!reputation || reputation.completedCount === 0) return "New · no history yet";
  const hasEnoughRatings =
    reputation.averageRating !== null && reputation.ratingCount >= MIN_RATINGS_FOR_AVERAGE;
  const ratingPart = hasEnoughRatings
    ? `★ ${reputation.averageRating!.toFixed(1)}`
    : reputation.ratingCount > 0
      ? `Building history (${reputation.ratingCount})`
      : "Not yet rated";
  return `${ratingPart} · ${reputation.completedCount} completed`;
}

function MatchCounterpart({
  post,
  myDistrict,
  myProvince,
}: {
  post: Post & { party: PartyWithReputation; photos: Pick<Photo, "id">[] };
  myDistrict: string;
  myProvince: string;
}) {
  const estimatedValue =
    post.askingPrice != null && post.quantity != null
      ? Number(post.askingPrice) * post.quantity
      : post.askingPrice != null
        ? Number(post.askingPrice)
        : null;

  return (
    <div className="mt-1">
      <p className="text-sm text-gray-600">
        {post.party.name} {post.type === "HAVE" ? "has" : "needs"}: {post.title}
      </p>
      <p className="text-xs text-gray-400">
        {reputationLabel(post.party.reputation)} ·{" "}
        {distanceLabel(post.district, post.province, myDistrict, myProvince)}
        {estimatedValue != null && ` · Est. value $${estimatedValue.toLocaleString()}`}
      </p>
      {post.photos.length > 0 && (
        <div className="mt-2 flex gap-2">
          {post.photos.map((photo) => (
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
  );
}
