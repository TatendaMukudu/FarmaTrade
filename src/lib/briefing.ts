import "server-only";
import { prisma } from "@/lib/prisma";
import { getPartyMemory } from "@/lib/memory";
import { getSignalsFor } from "@/lib/signals";
import { buildBriefing, type BriefingItem } from "@/lib/briefing-core";
import { resolveMatchSides } from "@/lib/match-view";

// How many suggested matches to consider for the briefing. The briefing is
// a shortlist, not the Opportunities page — pulling more just to throw them
// away costs a wider scan on the request that has to render fastest.
const OPPORTUNITY_SAMPLE = 5;

export type Briefing = {
  items: BriefingItem[];
  hasPosts: boolean;
};

export async function getBriefing(party: {
  id: string;
  province: string;
}): Promise<Briefing> {
  const [
    draftCount,
    openPostCount,
    activeMatches,
    conversations,
    memory,
    signals,
  ] = await Promise.all([
    prisma.post.count({ where: { partyId: party.id, status: "DRAFT" } }),
    prisma.post.count({ where: { partyId: party.id, status: "OPEN" } }),
    prisma.match.findMany({
      where: {
        status: { in: ["SUGGESTED", "ACCEPTED"] },
        OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
      },
      include: {
        postA: { include: { party: { select: { id: true, name: true } } } },
        postB: { include: { party: { select: { id: true, name: true } } } },
        confirmations: { select: { partyId: true } },
      },
      orderBy: { score: "desc" },
      take: 50,
    }),
    prisma.conversation.findMany({
      where: {
        match: {
          status: { in: ["ACCEPTED", "SUGGESTED"] },
          OR: [{ postA: { partyId: party.id } }, { postB: { partyId: party.id } }],
        },
        messages: { some: {} },
      },
      select: {
        matchId: true,
        messages: {
          select: { authorId: true, author: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 50,
    }),
    getPartyMemory(party.id),
    getSignalsFor(party),
  ]);

  const urgentMatches: { matchId: string; counterpartyName: string; title: string }[] = [];
  const awaitingYourConfirmation: { matchId: string; counterpartyName: string }[] = [];
  const topOpportunities: {
    matchId: string;
    counterpartyName: string;
    title: string;
    score: number;
    reasons: string[];
  }[] = [];

  for (const m of activeMatches) {
    const { yours, theirs } = resolveMatchSides(m, party.id);
    const counterpartyName = theirs.party.name;

    if (m.status === "ACCEPTED") {
      const iConfirmed = m.confirmations.some((c) => c.partyId === party.id);
      const theyConfirmed = m.confirmations.some((c) => c.partyId === theirs.party.id);
      // Only "waiting on you" once the other side has actually gone first —
      // otherwise this fires on every accepted match and stops meaning
      // anything.
      if (theyConfirmed && !iConfirmed) {
        awaitingYourConfirmation.push({ matchId: m.id, counterpartyName });
      }
      continue;
    }

    if (yours.urgent || theirs.urgent) {
      urgentMatches.push({ matchId: m.id, counterpartyName, title: theirs.title });
    } else if (topOpportunities.length < OPPORTUNITY_SAMPLE) {
      topOpportunities.push({
        matchId: m.id,
        counterpartyName,
        title: theirs.title,
        score: m.score,
        reasons: m.reasons,
      });
    }
  }

  // A conversation whose most recent message came from the counterparty is
  // one this party still owes a reply to. Cheaper and more honest than a
  // read-receipt table: it measures the thing that actually matters (is
  // someone waiting) rather than whether a page was rendered.
  const unreadConversations = conversations
    .filter((c) => c.messages[0] && c.messages[0].authorId !== party.id)
    .map((c) => ({
      matchId: c.matchId,
      counterpartyName: c.messages[0].author.name,
    }));

  const items = buildBriefing({
    draftCount,
    awaitingYourConfirmation,
    unreadConversations,
    urgentMatches,
    topOpportunities,
    anticipations: memory.anticipations,
    maintenanceDue: memory.maintenanceDue,
    signals: signals.map((s) => ({
      id: s.id,
      headline: s.headline,
      detail: s.detail,
      strength: s.strength,
    })),
  });

  return { items, hasPosts: openPostCount > 0 || draftCount > 0 };
}
