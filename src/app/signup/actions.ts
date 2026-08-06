"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { signupSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { PartyRole, VehicleType } from "@/generated/prisma/client";

export type SignupState = { error?: string };

// Keyed by IP rather than email — the thing worth slowing down is mass
// account creation, not a single person retrying their own signup. Mobile
// carriers commonly put many real users behind one shared IP (carrier-grade
// NAT), so this stays generous rather than risking real farmers behind the
// same gateway locking each other out.
const SIGNUP_LIMIT = 20;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

async function clientIp(): Promise<string | null> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || hdrs.get("x-real-ip") || null;
}

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  // Unknown IP (proxy header missing, e.g. local dev) fails open rather than
  // sharing one bucket across every caller — that would risk locking out
  // real users on a misconfiguration, which is worse than skipping the
  // limiter entirely until it's fixed.
  const ip = await clientIp();
  if (ip) {
    const { allowed, retryAfterMs } = checkRateLimit(`signup:${ip}`, SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
    if (!allowed) {
      logger.warn("signup.rate_limited", { ip });
      return {
        error: `Too many signups from this network. Try again in ${Math.ceil(retryAfterMs / 60_000)} minute(s).`,
      };
    }
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone") || undefined,
    province: formData.get("province"),
    district: formData.get("district"),
    roles: formData.getAll("roles"),
    farmName: formData.get("farmName") || undefined,
    sizeHectares: formData.get("sizeHectares") || undefined,
    vehicleType: formData.get("vehicleType") || undefined,
    capacityKg: formData.get("capacityKg") || undefined,
    serviceRegion: formData.get("serviceRegion") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    return { error: "An account with that email already exists" };
  }

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        phone: data.phone,
      },
    });

    const party = await tx.party.create({
      data: {
        userId: createdUser.id,
        name: data.name,
        roles: data.roles as PartyRole[],
        phone: data.phone,
        province: data.province,
        district: data.district,
      },
    });

    if (data.roles.includes("FARM") && data.farmName) {
      await tx.farm.create({
        data: {
          partyId: party.id,
          farmName: data.farmName,
          sizeHectares: data.sizeHectares,
        },
      });
    }

    if (data.roles.includes("TRANSPORTER") && data.vehicleType) {
      await tx.transportProfile.create({
        data: {
          partyId: party.id,
          vehicleType: data.vehicleType as VehicleType,
          capacityKg: data.capacityKg,
          serviceRegion: data.serviceRegion,
        },
      });
    }

    await tx.reputation.create({
      data: { partyId: party.id },
    });

    return createdUser;
  });

  await createSession(user.id);
  redirect("/dashboard");
}
