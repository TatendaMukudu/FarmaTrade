"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, destroySession, bumpSessionVersion, getSessionUserId } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";

export type LoginState = { error?: string };

// Generous enough that a real user mistyping a password twice never sees
// this, tight enough to slow down credential-stuffing against one account.
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();
  const rateLimitKey = `login:${email}`;
  const { allowed, retryAfterMs } = await checkRateLimit(rateLimitKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
  if (!allowed) {
    logger.warn("login.rate_limited", { email });
    return {
      error: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60_000)} minute(s).`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { party: { select: { id: true } } },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    // Recorded even when the email doesn't exist — a burst of failures
    // against addresses that were never registered is exactly what
    // credential stuffing looks like from the inside, and it's invisible
    // if only real accounts are logged.
    await recordAudit({
      action: "LOGIN_FAILED",
      partyId: user?.party?.id ?? null,
      detail: user ? "bad_password" : "unknown_email",
    });
    return { error: "Invalid email or password" };
  }

  await resetRateLimit(rateLimitKey);
  await recordAudit({ action: "LOGIN_SUCCESS", partyId: user.party?.id ?? null });
  await createSession(user.id, user.sessionVersion);
  redirect("/dashboard");
}

export async function logoutAction() {
  const userId = await getSessionUserId();
  if (userId) {
    const party = await prisma.party.findUnique({
      where: { userId },
      select: { id: true },
    });
    await recordAudit({ action: "LOGOUT", partyId: party?.id ?? null });
    await bumpSessionVersion(userId);
  }
  await destroySession();
  redirect("/login");
}
