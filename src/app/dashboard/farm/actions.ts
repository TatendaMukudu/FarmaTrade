"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import {
  livestockSchema,
  produceSchema,
  equipmentSchema,
} from "@/lib/validation";
import type {
  LivestockSpecies,
  LivestockSex,
  ProduceUnit,
  EquipmentCategory,
} from "@/generated/prisma/client";

export type FarmActionState = { error?: string };

async function requireFarmId(): Promise<string> {
  const party = await getCurrentParty();
  if (!party?.farm) {
    throw new Error("No farm profile for this account");
  }
  return party.farm.id;
}

export async function upsertLivestock(
  _prevState: FarmActionState,
  formData: FormData,
): Promise<FarmActionState> {
  const farmId = await requireFarmId();

  const parsed = livestockSchema.safeParse({
    id: formData.get("id") || undefined,
    species: formData.get("species"),
    breed: formData.get("breed") || undefined,
    sex: formData.get("sex"),
    quantity: formData.get("quantity"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...data } = parsed.data;

  const values = {
    species: data.species as LivestockSpecies,
    breed: data.breed,
    sex: data.sex as LivestockSex,
    quantity: data.quantity,
    notes: data.notes,
  };

  if (id) {
    await prisma.livestock.update({ where: { id, farmId }, data: values });
  } else {
    await prisma.livestock.create({ data: { ...values, farmId } });
  }

  revalidatePath("/dashboard/farm");
  return {};
}

export async function deleteLivestock(formData: FormData) {
  const farmId = await requireFarmId();
  const id = String(formData.get("id"));
  await prisma.livestock.delete({ where: { id, farmId } });
  revalidatePath("/dashboard/farm");
}

export async function upsertProduce(
  _prevState: FarmActionState,
  formData: FormData,
): Promise<FarmActionState> {
  const farmId = await requireFarmId();

  const parsed = produceSchema.safeParse({
    id: formData.get("id") || undefined,
    cropType: formData.get("cropType"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    perishable: formData.get("perishable") === "on",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...data } = parsed.data;

  const values = {
    cropType: data.cropType,
    quantity: data.quantity,
    unit: data.unit as ProduceUnit,
    perishable: data.perishable ?? true,
    notes: data.notes,
  };

  if (id) {
    await prisma.produceStock.update({ where: { id, farmId }, data: values });
  } else {
    await prisma.produceStock.create({ data: { ...values, farmId } });
  }

  revalidatePath("/dashboard/farm");
  return {};
}

export async function deleteProduce(formData: FormData) {
  const farmId = await requireFarmId();
  const id = String(formData.get("id"));
  await prisma.produceStock.delete({ where: { id, farmId } });
  revalidatePath("/dashboard/farm");
}

export async function upsertEquipment(
  _prevState: FarmActionState,
  formData: FormData,
): Promise<FarmActionState> {
  const farmId = await requireFarmId();

  const parsed = equipmentSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    category: formData.get("category"),
    condition: formData.get("condition") || undefined,
    available: formData.get("available") === "on",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...data } = parsed.data;

  const values = {
    name: data.name,
    category: data.category as EquipmentCategory,
    condition: data.condition,
    available: data.available ?? true,
    notes: data.notes,
  };

  if (id) {
    await prisma.equipment.update({ where: { id, farmId }, data: values });
  } else {
    await prisma.equipment.create({ data: { ...values, farmId } });
  }

  revalidatePath("/dashboard/farm");
  return {};
}

export async function deleteEquipment(formData: FormData) {
  const farmId = await requireFarmId();
  const id = String(formData.get("id"));
  await prisma.equipment.delete({ where: { id, farmId } });
  revalidatePath("/dashboard/farm");
}
