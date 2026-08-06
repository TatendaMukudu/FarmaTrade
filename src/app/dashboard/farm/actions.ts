"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import {
  livestockSchema,
  produceSchema,
  equipmentSchema,
} from "@/lib/validation";
import { parseCsv, normalizeRow } from "@/lib/csv";
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
    expectedHarvestDate: formData.get("expectedHarvestDate") || undefined,
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
    expectedHarvestDate: data.expectedHarvestDate,
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

export type ImportActionState = {
  error?: string;
  success?: string;
  skipped?: string[];
};

const IMPORT_FIELDS = {
  LIVESTOCK: ["species", "breed", "sex", "quantity", "notes"],
  PRODUCE: ["cropType", "quantity", "unit", "perishable", "expectedHarvestDate", "notes"],
  EQUIPMENT: ["name", "category", "condition", "available", "notes"],
} as const;

const ENUM_FIELDS = new Set(["species", "sex", "unit", "category"]);
const BOOLEAN_FIELDS = new Set(["perishable", "available"]);

function isTruthyCell(value: string) {
  return /^(1|true|yes|y)$/i.test(value.trim());
}

// Tolerant of case and phrasing (a farmer's own spreadsheet, not a machine
// export): enum-like columns are upper-cased and yes/no-style booleans are
// normalized to what the checkbox-driven schemas already expect ("on"/"").
function prepareRow(row: Record<string, string>, fields: readonly string[]) {
  const normalized = normalizeRow(row, [...fields]);
  for (const key of Object.keys(normalized)) {
    if (ENUM_FIELDS.has(key)) normalized[key] = normalized[key].toUpperCase();
    if (BOOLEAN_FIELDS.has(key)) normalized[key] = isTruthyCell(normalized[key]) ? "on" : "";
  }
  return normalized;
}

export async function importInventory(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const farmId = await requireFarmId();

  const category = String(formData.get("category"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file" };
  }
  if (file.type && file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
    return { error: "Only CSV files are supported right now" };
  }

  const rows = parseCsv(await file.text());
  if (rows.length === 0) {
    return { error: "That file has no data rows" };
  }

  const skipped: string[] = [];

  if (category === "LIVESTOCK") {
    const values: { species: LivestockSpecies; breed?: string; sex: LivestockSex; quantity: number; notes?: string }[] = [];
    rows.forEach((row, i) => {
      const parsed = livestockSchema.safeParse(prepareRow(row, IMPORT_FIELDS.LIVESTOCK));
      if (!parsed.success) {
        skipped.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return;
      }
      values.push({ ...parsed.data, species: parsed.data.species as LivestockSpecies, sex: parsed.data.sex as LivestockSex });
    });
    if (values.length > 0) {
      await prisma.livestock.createMany({ data: values.map((v) => ({ ...v, farmId })) });
    }
    revalidatePath("/dashboard/farm");
    return finishImport(values.length, skipped);
  }

  if (category === "PRODUCE") {
    const values: {
      cropType: string;
      quantity: number;
      unit: ProduceUnit;
      perishable?: boolean;
      expectedHarvestDate?: Date;
      notes?: string;
    }[] = [];
    rows.forEach((row, i) => {
      const parsed = produceSchema.safeParse(prepareRow(row, IMPORT_FIELDS.PRODUCE));
      if (!parsed.success) {
        skipped.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return;
      }
      values.push({ ...parsed.data, unit: parsed.data.unit as ProduceUnit });
    });
    if (values.length > 0) {
      await prisma.produceStock.createMany({ data: values.map((v) => ({ ...v, farmId })) });
    }
    revalidatePath("/dashboard/farm");
    return finishImport(values.length, skipped);
  }

  if (category === "EQUIPMENT") {
    const values: { name: string; category: EquipmentCategory; condition?: string; available?: boolean; notes?: string }[] = [];
    rows.forEach((row, i) => {
      const parsed = equipmentSchema.safeParse(prepareRow(row, IMPORT_FIELDS.EQUIPMENT));
      if (!parsed.success) {
        skipped.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return;
      }
      values.push({ ...parsed.data, category: parsed.data.category as EquipmentCategory });
    });
    if (values.length > 0) {
      await prisma.equipment.createMany({ data: values.map((v) => ({ ...v, farmId })) });
    }
    revalidatePath("/dashboard/farm");
    return finishImport(values.length, skipped);
  }

  return { error: "Pick what kind of inventory you're importing" };
}

function finishImport(createdCount: number, skipped: string[]): ImportActionState {
  return {
    success: `${createdCount} row${createdCount === 1 ? "" : "s"} imported${
      skipped.length > 0 ? `, ${skipped.length} skipped` : ""
    }`,
    skipped: skipped.slice(0, 8),
  };
}
