"use server";

import { revalidatePath } from "next/cache";
import { getCurrentParty } from "@/lib/auth";
import { blockParty, unblockParty, fileReport } from "@/lib/safety";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { REPORT_REASONS } from "@/lib/safety-reasons";
import type { ReportReason } from "@/generated/prisma/enums";

export type SafetyActionState = { error?: string; done?: string };

// Reports are rate-limited per reporter. A report is a moderation summons
// against a real business, and an unlimited one is a harassment tool — a
// competitor filing twenty a day would bury a rival's account under an
// "under review" cloud without ever having to be right about anything.
const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function blockPartyAction(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const targetId = String(formData.get("targetId"));
  if (!targetId || targetId === party.id) return;

  await blockParty(party.id, targetId, String(formData.get("reason") || "") || undefined);

  revalidatePath("/dashboard/directory");
  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard");
}

export async function unblockPartyAction(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const targetId = String(formData.get("targetId"));
  if (!targetId) return;

  await unblockParty(party.id, targetId);

  revalidatePath("/dashboard/directory");
  revalidatePath("/dashboard/opportunities");
}

export async function reportPartyAction(
  _prev: SafetyActionState,
  formData: FormData,
): Promise<SafetyActionState> {
  const party = await getCurrentParty();
  if (!party) return { error: "Not signed in" };

  const subjectId = String(formData.get("subjectId"));
  if (!subjectId) return { error: "Nothing to report" };
  if (subjectId === party.id) return { error: "You can't report your own account" };

  const reason = String(formData.get("reason")) as ReportReason;
  if (!REPORT_REASONS.some((r) => r.value === reason)) {
    return { error: "Pick a reason" };
  }

  const { allowed } = await checkRateLimit(`report:${party.id}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!allowed) {
    logger.warn("report.rate_limited", { partyId: party.id });
    return { error: "You've filed several reports today. Try again tomorrow." };
  }

  await fileReport({
    reporterId: party.id,
    subjectId,
    reason,
    detail: String(formData.get("detail") || "") || undefined,
  });

  revalidatePath(`/dashboard/directory/${subjectId}`);
  return { done: "Thanks — we'll review this." };
}
