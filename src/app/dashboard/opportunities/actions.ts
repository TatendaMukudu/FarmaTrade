"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";

export async function respondToMatch(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  if (decision !== "ACCEPTED" && decision !== "DECLINED") return;

  const match = await prisma.match.findUnique({
    where: { id },
    select: { postA: { select: { partyId: true } }, postB: { select: { partyId: true } } },
  });
  if (!match) return;

  const ownsMatch =
    match.postA.partyId === party.id || match.postB.partyId === party.id;
  if (!ownsMatch) return;

  await prisma.match.update({
    where: { id },
    data: { status: decision },
  });

  revalidatePath("/dashboard/opportunities");
}
