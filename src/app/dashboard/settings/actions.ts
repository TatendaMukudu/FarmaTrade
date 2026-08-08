"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { profileSchemaFor } from "@/lib/validation";
import { regionFor } from "@/lib/regions";
import type { VehicleType } from "@/generated/prisma/client";

export type ProfileActionState = { error?: string; success?: boolean };

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const party = await getCurrentParty();
  if (!party) return { error: "Not signed in" };

  const parsed = profileSchemaFor(regionFor(party.countryCode).labels).safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    contactDetails: formData.get("contactDetails") || undefined,
    province: formData.get("province"),
    district: formData.get("district"),
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

  await prisma.party.update({
    where: { id: party.id },
    data: {
      name: data.name,
      phone: data.phone,
      contactDetails: data.contactDetails,
      province: data.province,
      district: data.district,
    },
  });

  if (party.farm && data.farmName) {
    await prisma.farm.update({
      where: { id: party.farm.id },
      data: { farmName: data.farmName, sizeHectares: data.sizeHectares },
    });
  }

  if (party.transportProfile && data.vehicleType) {
    await prisma.transportProfile.update({
      where: { id: party.transportProfile.id },
      data: {
        vehicleType: data.vehicleType as VehicleType,
        capacityKg: data.capacityKg,
        serviceRegion: data.serviceRegion,
      },
    });
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
