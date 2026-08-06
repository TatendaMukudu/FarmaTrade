import Link from "next/link";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "./actions";
import { ConfirmForm } from "./confirm-form";
import { MarkSeen } from "./mark-seen";
import { summarizeReputation, buildTrustProfile } from "@/lib/reputation";
import { objectiveSpec } from "@/lib/objectives";
import {
  resolveMatchSides,
  groupMatchesByOwnPost,
  combinedOfferedQuantity,
  distanceLabel,
  estimatedPostValue,
} from "@/lib/match-view";
import { Badge } from "@/components/badge";
import type { Post, Party, Reputation, Photo } from "@/generated/prisma/client";

type PartyWithReputation = Party & { reputation: Reputation | null };
type CounterpartPost = Post & { party: PartyWithReputation; photos: Pick<Photo, "id">[] };

const SOLID_BUTTON =
  "rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover";
const OUTLINE_BUTTON =
  "rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-foreground";

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
      <MarkSeen />
      <div>
        <h1 className="text-2xl font-semibold">Opportunities</h1>
        <p className="text-sm text-gray-500">
          Matches FarmaTrade found between your posts and the opposite side.
        </p>
      </div>

      {active.length === 0 && (
        <p className="text-sm text-gray-400">
          No opportunities yet — post what you have or need to get matched.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {groupMatchesByOwnPost<CounterpartPost, (typeof active)[number]>(active, party.id).map((group) => {
          const showAggregate =
            group.yours.type === "NEED" && group.yours.quantity != null && group.matches.length >= 2;
          const combined = showAggregate
            ? combinedOfferedQuantity<CounterpartPost, (typeof active)[number]>(group.matches, party.id)
            : 0;
          const needed = group.yours.quantity ?? 0;

          return (
            <div key={group.yours.id} className="flex flex-col gap-3">
              {showAggregate && (
                <div className="rounded-lg border border-border bg-new-bg p-3">
                  <p className="text-sm font-medium text-new-fg">
                    Combined available for &ldquo;{group.yours.title}&rdquo;: {combined.toLocaleString()} /{" "}
                    {needed.toLocaleString()} {group.yours.unit ?? ""} across {group.matches.length} matches
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.min(100, (combined / needed) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <ul className="flex flex-col gap-3">
                {group.matches.map((m) => {
                  const { yours, theirs } = resolveMatchSides<CounterpartPost>(m, party.id);
                  const myConfirmation = m.confirmations.find((c) => c.partyId === party.id);
                  const strength = strengthByCounterparty.get(theirs.party.id);
                  return (
                    <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span>{m.status}</span>
                            {(yours.urgent || theirs.urgent) && <Badge tone="warning">Time-sensitive</Badge>}
                            {strength && strength >= 2 && (
                              <Badge tone="info">Preferred partner · {strength} completed</Badge>
                            )}
                          </div>
                          <p className="mt-1 font-medium">Your post: {yours.title}</p>
                          <MatchCounterpart post={theirs} myDistrict={party.district} myProvince={party.province} />
                          {m.reasons.length > 0 && (
                            <p className="mt-2 text-sm font-medium text-foreground">
                              Why: <span className="font-normal">{m.reasons.join(" · ")}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {m.status === "SUGGESTED" && (
                            <form action={respondToMatch} className="flex gap-2">
                              <input type="hidden" name="id" value={m.id} />
                              <button type="submit" name="decision" value="ACCEPTED" className={SOLID_BUTTON}>
                                Accept
                              </button>
                              <button type="submit" name="decision" value="DECLINED" className={OUTLINE_BUTTON}>
                                Decline
                              </button>
                            </form>
                          )}
                          <div className="flex gap-2">
                            <Link href={`/dashboard/conversations/${m.id}`} className={OUTLINE_BUTTON}>
                              Message
                            </Link>
                            <Link href={`/dashboard/directory/${theirs.party.id}`} className={OUTLINE_BUTTON}>
                              View profile
                            </Link>
                          </div>
                        </div>
                      </div>
                      {m.status === "ACCEPTED" && (
                        <div className="mt-4 border-t border-border pt-4">
                          {myConfirmation ? (
                            <p className="text-sm text-gray-500">
                              You reported: {myConfirmation.outcome.replace(/_/g, " ")}.
                              Waiting on {theirs.party.name} to confirm their side.
                            </p>
                          ) : (
                            <ConfirmForm
                              matchId={m.id}
                              counterpartyName={theirs.party.name}
                              counterpartyWasSupplier={theirs.type === "HAVE"}
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">History</h2>
          <ul className="flex flex-col gap-2">
            {history.map((m) => {
              const { yours, theirs } = resolveMatchSides(m, party.id);
              const myConfirmation = m.confirmations.find(
                (c) => c.partyId === party.id,
              );
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-gray-600"
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

function MatchCounterpart({
  post,
  myDistrict,
  myProvince,
}: {
  post: CounterpartPost;
  myDistrict: string;
  myProvince: string;
}) {
  const reputation = summarizeReputation(post.party.reputation);
  const trust = buildTrustProfile(post.party.reputation);
  const estimatedValue = estimatedPostValue(post);
  const spec = objectiveSpec(post.objective);

  return (
    <div className="mt-1">
      <p className="text-sm text-gray-600">
        {post.party.name} {spec.verb}: {post.title}
        {post.recurring && (
          <Badge tone="info" className="ml-2">
            Standing order
          </Badge>
        )}
      </p>
      <p className="text-xs text-gray-400">
        {reputation.headline}
        {reputation.hasHistory && ` · ${reputation.completedLine}`} ·{" "}
        {distanceLabel(post.district, post.province, myDistrict, myProvince)}
        {estimatedValue != null &&
          ` · Est. value ${estimatedValue.currency} ${estimatedValue.amount.toLocaleString()}`}
        {post.destinationDistrict &&
          post.destinationProvince &&
          ` · Route: ${post.district} → ${post.destinationDistrict}`}
      </p>
      {/* The two trust facts most likely to decide whether this is worth a
          phone call, surfaced on the card rather than one tap away on the
          profile. */}
      {(trust.headline || trust.repeatPartnerLine || trust.responseLine) && (
        <p className="mt-1 text-xs text-gray-500">
          {[trust.headline, trust.repeatPartnerLine, trust.responseLine]
            .filter(Boolean)
            .slice(0, 2)
            .join(" · ")}
        </p>
      )}
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
