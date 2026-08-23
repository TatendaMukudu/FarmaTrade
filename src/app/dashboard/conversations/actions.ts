"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";

async function assertPartyInMatch(matchId: string, partyId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { intentA: { select: { partyId: true } }, intentB: { select: { partyId: true } } },
  });
  if (!match) return false;
  return match.intentA.partyId === partyId || match.intentB.partyId === partyId;
}

export async function sendMessage(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const matchId = String(formData.get("matchId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const allowed = await assertPartyInMatch(matchId, party.id);
  if (!allowed) return;

  const conversation = await prisma.conversation.upsert({
    where: { matchId },
    create: { matchId },
    update: {},
  });

  await prisma.message.create({
    data: { conversationId: conversation.id, authorId: party.id, body },
  });

  revalidatePath(`/dashboard/conversations/${matchId}`);
}
