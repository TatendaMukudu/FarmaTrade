import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "../../opportunities/actions";
import { ConfirmForm } from "../../opportunities/confirm-form";
import { MessageForm } from "../message-form";
import { resolveMatchSides, isPartyInMatch } from "@/lib/match-view";
import { findTransportersForRoute } from "@/lib/transport-suggestions";
import { summarizeReputation } from "@/lib/reputation";

export default async function ConversationPage({
  params,
}: PageProps<"/dashboard/conversations/[matchId]">) {
  const { matchId } = await params;
  const party = await getCurrentParty();
  if (!party) return null;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      postA: { include: { party: true, photos: { select: { id: true } } } },
      postB: { include: { party: true, photos: { select: { id: true } } } },
      confirmations: true,
      conversation: {
        include: { messages: { include: { author: true }, orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!match) notFound();

  if (!isPartyInMatch(match, party.id)) notFound();

  const { yours, theirs } = resolveMatchSides(match, party.id);
  const messages = match.conversation?.messages ?? [];
  const myConfirmation = match.confirmations.find((c) => c.partyId === party.id);

  // A PRODUCE/LIVESTOCK/EQUIPMENT/INPUTS match and a TRANSPORT match are
  // two separate graphs — once a trade like this is accepted, the two
  // parties know they need to move goods from one place to the other but
  // have no way to find a transporter without separately posting a
  // TRANSPORT NEED. Surface it directly instead of leaving it as a gap.
  let transporters: Awaited<ReturnType<typeof findTransportersForRoute>> = [];
  const havePost = match.postA.type === "HAVE" ? match.postA : match.postB;
  const needPost = match.postA.type === "NEED" ? match.postA : match.postB;
  if (match.status === "ACCEPTED" && match.postA.category !== "TRANSPORT") {
    transporters = await findTransportersForRoute(
      { province: havePost.province, district: havePost.district },
      { province: needPost.province, district: needPost.district },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/opportunities" className="text-sm text-muted-fg underline">
        ← Back to opportunities
      </Link>

      <div>
        <h1 className="text-xl font-semibold">
          <Link href={`/dashboard/directory/${theirs.party.id}`} className="hover:underline">
            {theirs.party.name}
          </Link>
        </h1>
        <p className="text-sm text-muted-fg">
          Your post: {yours.title} ↔ Their post: {theirs.title}
        </p>
        <p className="mt-1 text-xs text-subtle-fg">Status: {match.status}</p>
        {theirs.photos.length > 0 && (
          <div className="mt-2 flex gap-2">
            {theirs.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={`/api/photos/${photo.id}`}
                alt=""
                className="h-20 w-20 rounded-control object-cover"
              />
            ))}
          </div>
        )}
      </div>

      {match.status === "SUGGESTED" && (
        <form action={respondToMatch} className="flex gap-2">
          <input type="hidden" name="id" value={match.id} />
          <button
            type="submit"
            name="decision"
            value="ACCEPTED"
            className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
          >
            Accept
          </button>
          <button
            type="submit"
            name="decision"
            value="DECLINED"
            className="rounded-control border px-3 py-1.5 text-xs"
          >
            Decline
          </button>
        </form>
      )}

      <div className="flex min-h-[240px] flex-col gap-2 rounded-control border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-subtle-fg">
            No messages yet — say hello and agree on price, quantity, and pickup.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-control px-3 py-2 text-sm ${
              m.authorId === party.id
                ? "self-end bg-accent text-accent-foreground"
                : "self-start bg-new-bg text-foreground"
            }`}
          >
            {m.body}
          </div>
        ))}
      </div>

      <MessageForm matchId={match.id} />

      {transporters.length > 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          <p className="text-sm font-medium">Need transport for this?</p>
          <p className="text-xs text-muted-fg">
            These transporters&apos; routes cover{" "}
            {havePost.district === needPost.district
              ? havePost.district
              : havePost.province === needPost.province
                ? `${havePost.district} → ${needPost.district}`
                : `${havePost.province} → ${needPost.province}`}
            .
          </p>
          <ul className="flex flex-col gap-2">
            {transporters.map((t) => {
              const rep = summarizeReputation(t.party.reputation);
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/directory/${t.party.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {t.party.name}
                    </Link>
                    <p className="text-xs text-muted-fg">
                      {t.province}
                      {t.destinationProvince ? ` → ${t.destinationProvince}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                      rep.tone === "success" ? "bg-success-bg text-success-fg" : "bg-new-bg text-new-fg"
                    }`}
                  >
                    {rep.headline}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {match.status === "ACCEPTED" && (
        <div className="border-t pt-4">
          {myConfirmation ? (
            <p className="text-sm text-muted-fg">
              You reported: {myConfirmation.outcome.replace(/_/g, " ")}. Waiting on{" "}
              {theirs.party.name} to confirm their side.
            </p>
          ) : (
            <ConfirmForm matchId={match.id} counterpartyName={theirs.party.name} />
          )}
        </div>
      )}
    </div>
  );
}
