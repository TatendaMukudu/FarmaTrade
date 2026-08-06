import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch } from "../../opportunities/actions";
import { ConfirmForm } from "../../opportunities/confirm-form";
import { MessageForm } from "../message-form";

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

  const ownsMatch = match.postA.partyId === party.id || match.postB.partyId === party.id;
  if (!ownsMatch) notFound();

  const yours = match.postA.partyId === party.id ? match.postA : match.postB;
  const theirs = match.postA.partyId === party.id ? match.postB : match.postA;
  const messages = match.conversation?.messages ?? [];
  const myConfirmation = match.confirmations.find((c) => c.partyId === party.id);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/dashboard/opportunities" className="text-sm text-gray-500 underline">
        ← Back to opportunities
      </Link>

      <div>
        <h1 className="text-xl font-semibold">
          <Link href={`/dashboard/directory/${theirs.party.id}`} className="hover:underline">
            {theirs.party.name}
          </Link>
        </h1>
        <p className="text-sm text-gray-500">
          Your post: {yours.title} ↔ Their post: {theirs.title}
        </p>
        <p className="mt-1 text-xs text-gray-400">Status: {match.status}</p>
        {theirs.photos.length > 0 && (
          <div className="mt-2 flex gap-2">
            {theirs.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photo.id}
                src={`/api/photos/${photo.id}`}
                alt=""
                className="h-20 w-20 rounded object-cover"
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

      <div className="flex min-h-[240px] flex-col gap-2 rounded border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400">
            No messages yet — say hello and agree on price, quantity, and pickup.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded px-3 py-2 text-sm ${
              m.authorId === party.id
                ? "self-end bg-black text-white"
                : "self-start bg-gray-100 text-gray-900"
            }`}
          >
            {m.body}
          </div>
        ))}
      </div>

      <MessageForm matchId={match.id} />

      {match.status === "ACCEPTED" && (
        <div className="border-t pt-4">
          {myConfirmation ? (
            <p className="text-sm text-gray-500">
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
