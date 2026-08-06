// Single source of truth for every enum a form/select surfaces to a user.
// Values always come from Prisma's own generated enum (so this can never
// drift from the schema); only the human-readable label is hand-written
// here, once, instead of being re-typed at every call site.
import {
  PartyRole,
  LivestockSpecies,
  LivestockSex,
  ProduceUnit,
  EquipmentCategory,
  VehicleType,
} from "@/generated/prisma/enums";

export const PARTY_ROLES = Object.values(PartyRole);

export const LIVESTOCK_SPECIES = Object.values(LivestockSpecies);
export const LIVESTOCK_SPECIES_LABEL: Record<LivestockSpecies, string> = {
  CATTLE: "Cattle",
  GOAT: "Goat",
  SHEEP: "Sheep",
  PIG: "Pig",
  POULTRY: "Poultry",
  OTHER: "Other",
};

export const LIVESTOCK_SEX = Object.values(LivestockSex);
export const LIVESTOCK_SEX_LABEL: Record<LivestockSex, string> = {
  MALE: "Male",
  FEMALE: "Female",
  MIXED: "Mixed",
};

export const PRODUCE_UNIT = Object.values(ProduceUnit);
export const PRODUCE_UNIT_LABEL: Record<ProduceUnit, string> = {
  KG: "kg",
  TONNE: "tonne",
  BAG: "bag",
  CRATE: "crate",
  LITRE: "litre",
  HEAD: "head",
};

export const EQUIPMENT_CATEGORY = Object.values(EquipmentCategory);
export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  TRACTOR: "Tractor",
  PLOUGH: "Plough",
  IRRIGATION: "Irrigation",
  TRAILER: "Trailer",
  OTHER: "Other",
};

export const VEHICLE_TYPE = Object.values(VehicleType);
export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  TRUCK: "Truck",
  REFRIGERATED_TRUCK: "Refrigerated truck",
  PICKUP: "Pickup",
  TRAILER: "Trailer",
  OTHER: "Other",
};
