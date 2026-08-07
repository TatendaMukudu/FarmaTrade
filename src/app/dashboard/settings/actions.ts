"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import { regionPoint } from "@/lib/countries";
import type { VehicleType, Capability } from "@/generated/prisma/client";

// Freeform multi-line fields (languages, licences) arrive as one textarea
// and are split here rather than making the user manage a repeating input —
// typing one per line is faster than tapping "add another" on a phone.
function lines(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export type ProfileActionState = { error?: string; success?: boolean };

export async function updateProfile(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const party = await getCurrentParty();
  if (!party) return { error: "Not signed in" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    contactDetails: formData.get("contactDetails") || undefined,
    region: formData.get("region"),
    locality: formData.get("locality"),
    capabilities: formData.getAll("capabilities"),
    operatingRadiusKm: formData.get("operatingRadiusKm") || undefined,
    languages: lines(formData.get("languages")),
    licenses: lines(formData.get("licenses")),
    yearsExperience: formData.get("yearsExperience") || undefined,
    availabilityNote: formData.get("availabilityNote") || undefined,
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
      region: data.region,
      locality: data.locality,
      // Re-derived on every save, so moving region actually moves you on
      // the map rather than leaving stale coordinates behind.
      ...(() => {
        const point = regionPoint(party.countryCode, data.region);
        return { latitude: point?.latitude ?? null, longitude: point?.longitude ?? null };
      })(),
      capabilities: data.capabilities as Capability[],
      operatingRadiusKm: data.operatingRadiusKm ?? null,
      languages: data.languages ?? [],
      licenses: data.licenses ?? [],
      yearsExperience: data.yearsExperience ?? null,
      availabilityNote: data.availabilityNote ?? null,
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
  revalidatePath("/dashboard/directory");
  return { success: true };
}
