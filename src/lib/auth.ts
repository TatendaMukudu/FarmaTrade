import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "farmatrade_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// sessionVersion is embedded in the token and re-checked against the DB on
// every request (see getSessionUserId) — the only lever that exists to
// invalidate an outstanding token before its 30-day expiry, since sessions
// are otherwise stateless with no server-side record to revoke.
export async function createSession(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ userId, sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Invalidates every outstanding token for this user immediately — the
// mismatch is caught on their next request via getSessionUserId, rather
// than waiting out the token's 30-day expiry. Called on logout (so a
// token exfiltrated before logout stops working, not just the browser's
// cookie copy) and available for a future "log out everywhere" action.
export async function bumpSessionVersion(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.sessionVersion !== "number") {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { sessionVersion: true },
    });
    if (!user || user.sessionVersion !== payload.sessionVersion) return null;

    return payload.userId;
  } catch {
    return null;
  }
}

// React.cache() dedupes calls within a single render pass — every
// dashboard route calls this at least once (layout.tsx and the page both,
// on every request), which was two identical round trips per request
// before this. cache() doesn't persist across requests, so there's no
// stale-session risk: a fresh render is a fresh cache.
export const getCurrentParty = cache(async () => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return prisma.party.findUnique({
    where: { userId },
    include: { farm: true, transportProfile: true, reputation: true },
  });
});
