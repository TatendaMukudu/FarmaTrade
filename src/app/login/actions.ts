"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, destroySession } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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
  const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
  if (!allowed) {
    logger.warn("login.rate_limited", { email });
    return {
      error: `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 60_000)} minute(s).`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }

  resetRateLimit(rateLimitKey);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
