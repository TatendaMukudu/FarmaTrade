"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession } from "@/lib/auth";
import { signupSchema } from "@/lib/validation";
import type { PartyRole, VehicleType } from "@/generated/prisma/client";

export type SignupState = { error?: string };

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
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
