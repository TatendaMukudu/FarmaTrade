import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentParty } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { respondToMatch, proposeMatchTerms } from "../../opportunities/actions";
import { ConfirmForm } from "../../opportunities/confirm-form";
import { MessageForm } from "../message-form";
import { resolveMatchSides, isPartyInMatch } from "@/lib/match-view";
import { findTransportersForRoute } from "@/lib/transport-suggestions";
import { summarizeReputation } from "@/lib/reputation";
import {
  awaitingFrom,
  governingTerms,
  openTerms,
  viewFor,
  type Participants,
} from "@/lib/agreement-core";
import { toTermsVersions } from "@/lib/agreement-view";
import type { TermsVersion } from "@/lib/agreement-core";
import { valuationFor } from "@/lib/pricing";
import { CURRENCIES, currencyByCode, formatMoneyAmount } from "@/lib/money";
import { unitByCode } from "@/lib/measurement";
import { regionFor } from "@/lib/regions";
import { formatQuantity } from "@/lib/units";
import { buttonClass } from "@/components/ui";

// The same coordination vocabulary the opportunities page uses, phrased for
// a page you are already inside.
const STATE_LINE: Record<string, string> = {
  suggested: "Suggested by FarmaTrade — nobody has answered yet",
  waiting_for_you: "Waiting for your answer",
  waiting_for_them: "Waiting for them to answer",
  agreed: "Agreed by both of you",
  renegotiating: "Agreed, with new terms on the table",
  completed: "Completed",
  closed: "Closed",
};

// "500 USD per tonne" or "500 USD for the whole lot" — never a bare number
// that each reader interprets for themselves.
function describePrice(terms: TermsVersion): string {
  if (terms.price == null) return "";
  const currency = terms.priceCurrency ?? "";
  const amount = `${terms.price}${currency ? ` ${currency}` : ""}`;
  if (terms.priceBasis === "TOTAL") return `${amount} for the whole lot`;
  const per = unitByCode(terms.priceUnitCode);
  return per ? `${amount} per ${per.one}` : amount;
}

function valuationOfTerms(terms: TermsVersion) {
  return valuationFor(
    {
      amount: terms.price,
      currencyCode: terms.priceCurrency,
      basis: terms.priceBasis,
      perUnitCode: terms.priceUnitCode,
    },
    { value: terms.quantity, unitCode: terms.unitCode },
    currencyByCode,
  );
}

export default async function ConversationPage({
  params,
  searchParams,
}: PageProps<"/dashboard/conversations/[matchId]">) {
  const { matchId } = await params;
  const query = await searchParams;
  const party = await getCurrentParty();
  if (!party) return null;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      intentA: { include: { party: true, photos: { select: { id: true } } } },
      intentB: { include: { party: true, photos: { select: { id: true } } } },
      confirmations: true,
      terms: {
        include: { acceptances: { select: { partyId: true } } },
        orderBy: { version: "asc" },
      },
      conversation: {
        include: { messages: { include: { author: true }, orderBy: { createdAt: "asc" } } },
      },
      cancellation: { include: { cancelledBy: { select: { name: true } }, terms: true } },
    },
  });
  if (!match) notFound();

  if (!isPartyInMatch(match, party.id)) notFound();

  const { yours, theirs } = resolveMatchSides(match, party.id);
  const messages = match.conversation?.messages ?? [];
  const myConfirmation = match.confirmations.find((c) => c.partyId === party.id);

  const versions = toTermsVersions(match.terms);
  const participants: Participants = [match.intentA.partyId, match.intentB.partyId];
  const view = viewFor({ status: match.status, versions }, participants, party.id);
  const governing = governingTerms(versions, participants);
  const open = openTerms(versions, participants);
  const yourMove = open != null && awaitingFrom(open, participants).includes(party.id);
  const settled = view === "agreed" || view === "renegotiating";
  const region = regionFor(party.countryCode);

  // A PRODUCE/LIVESTOCK/EQUIPMENT/INPUTS match and a TRANSPORT match are
  // two separate graphs — once a trade like this is accepted, the two
  // parties know they need to move goods from one place to the other but
  // have no way to find a transporter without separately posting a
  // TRANSPORT NEED. Surface it directly instead of leaving it as a gap.
  let transporters: Awaited<ReturnType<typeof findTransportersForRoute>> = [];
  const havePost = match.intentA.side === "SUPPLY" ? match.intentA : match.intentB;
  const needPost = match.intentA.side === "DEMAND" ? match.intentA : match.intentB;
  if (settled && match.intentA.category !== "TRANSPORT") {
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

      {query.agreementError === "source-measurement-mismatch" && (
        <div className="rounded-card border border-border bg-warning-bg p-4 text-sm text-warning-fg" role="alert">
          These terms use a measurement that cannot be compared with the farm source. Use the source package unit
          (for example, bags with bags), or first update the source measurement in Farm to a measured mass or volume.
          FarmaTrade will not assume a package weight.
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold">
          <Link href={`/dashboard/directory/${theirs.party.id}`} className="hover:underline">
            {theirs.party.name}
          </Link>
        </h1>
        <p className="text-sm text-muted-fg">
          Your post: {yours.title} ↔ Their post: {theirs.title}
        </p>
        <p className="mt-1 text-xs text-subtle-fg">{STATE_LINE[view]}</p>
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

      {/* What is on the table, and whose answer it is waiting for. The
          numbers are spelled out because agreeing to terms you cannot see
          is not agreement to anything. */}
      {(governing || open) && (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
          {governing && (
            <p className="text-sm">
              <span className="font-medium">Agreed:</span>{" "}
              {governing.quantity != null
                ? formatQuantity(governing.quantity, governing.unit)
                : "an amount you have not put a number to"}
              {governing.price != null && ` at ${describePrice(governing)}`}
              {governing.handoverOn &&
                ` · handover ${governing.handoverOn.toLocaleDateString("en-GB")}`}
              {(() => {
                const value = valuationOfTerms(governing);
                return value.ok ? ` — ${formatMoneyAmount(value.total)} in total` : "";
              })()}
            </p>
          )}
          {open && (
            <p className="text-sm text-muted-fg">
              <span className="font-medium">
                {yourMove ? `${theirs.party.name} proposes` : "You proposed"}:
              </span>{" "}
              {open.quantity != null
                ? formatQuantity(open.quantity, open.unit)
                : "no particular amount"}
              {open.price != null && ` at ${describePrice(open)}`}
              {open.handoverOn && ` · handover ${open.handoverOn.toLocaleDateString("en-GB")}`}
              {(() => {
                const value = valuationOfTerms(open);
                return value.ok ? ` — ${formatMoneyAmount(value.total)} in total` : "";
              })()}
              {governing && " — replacing the terms above, once you both agree"}
            </p>
          )}
        </div>
      )}

      {(match.status === "SUGGESTED" || yourMove) && (
        <form action={respondToMatch} className="flex gap-2">
          <input type="hidden" name="id" value={match.id} />
          {open && <input type="hidden" name="version" value={open.version} />}
          <button type="submit" name="decision" value="ACCEPTED" className={buttonClass("primary", "sm")}>
            {open ? "Agree to these terms" : "I am interested"}
          </button>
          <button type="submit" name="decision" value="DECLINED" className={buttonClass("secondary", "sm")}>
            Decline
          </button>
        </form>
      )}

      {/* Proposing different terms, which is how a negotiation actually
          works between two people. It writes a new version rather than
          editing the current one, so nobody's earlier consent is quietly
          carried onto a deal they did not see. Any agreement already in
          force keeps standing until this one is agreed too. */}
      {view !== "completed" && view !== "closed" && (
        <details className="rounded-card border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {governing ? "Propose different terms" : "Propose terms"}
          </summary>
          <form action={proposeMatchTerms} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="matchId" value={match.id} />
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Quantity
              <input
                type="number"
                name="quantity"
                step="any"
                min="0"
                defaultValue={open?.quantity ?? governing?.quantity ?? undefined}
                className="w-28 rounded-control border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Unit
              <input
                type="text"
                name="unit"
                defaultValue={open?.unit ?? governing?.unit ?? yours.unit ?? ""}
                className="w-24 rounded-control border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Price
              <input
                type="number"
                name="price"
                step="any"
                min="0"
                defaultValue={open?.price ?? governing?.price ?? undefined}
                className="w-28 rounded-control border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Currency
              <select
                name="priceCurrency"
                defaultValue={
                  open?.priceCurrency ?? governing?.priceCurrency ?? region.currencyCode
                }
                className="rounded-control border border-border bg-background px-2 py-1 text-sm"
              >
                {Object.keys(CURRENCIES).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {/* Agreeing to "450" is not agreeing to anything. Both parties
                see which of the two it is before either says yes. */}
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              That price is
              <select
                name="priceBasis"
                defaultValue={open?.priceBasis ?? governing?.priceBasis ?? "PER_UNIT"}
                className="rounded-control border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="PER_UNIT">per unit</option>
                <option value="TOTAL">for the whole lot</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Per
              <input
                type="text"
                name="priceUnit"
                defaultValue={
                  open?.priceUnitCode ??
                  governing?.priceUnitCode ??
                  open?.unit ??
                  governing?.unit ??
                  yours.unit ??
                  ""
                }
                placeholder="tonne"
                className="w-24 rounded-control border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-fg">
              Handover date
              <input
                type="date"
                name="handoverOn"
                defaultValue={(open?.handoverOn ?? governing?.handoverOn)?.toISOString().slice(0, 10) ?? ""}
                className="rounded-control border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Propose
            </button>
          </form>
          <p className="mt-2 text-xs text-subtle-fg">
            {theirs.party.name} has to agree before anything is settled.
          </p>
        </details>
      )}

      {match.cancellation && (
        <div className="rounded-card border border-border bg-warning-bg p-4 text-sm">
          <p className="font-medium text-warning-fg">Agreement cancelled</p>
          <p className="mt-1 text-muted-fg">
            {match.cancellation.cancelledBy.name} cancelled this agreement on{" "}
            {match.cancellation.createdAt.toLocaleDateString("en-GB")}.
            The agreed terms remain in the trade record.
          </p>
        </div>
      )}

      {settled && !match.cancellation && (
        <details className="rounded-card border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Cancel this agreement</summary>
          <p className="mt-2 text-sm text-muted-fg">
            This releases the committed quantity but keeps a permanent record of who cancelled and what was agreed.
          </p>
          <form action={respondToMatch} className="mt-3">
            <input type="hidden" name="id" value={match.id} />
            <button type="submit" name="decision" value="DECLINED" className={buttonClass("secondary", "sm")}>
              Confirm cancellation
            </button>
          </form>
        </details>
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

      {settled && (
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
