import { z } from "zod";
import { POST_CATEGORIES } from "@/lib/categories";
import {
  PARTY_ROLES,
  LIVESTOCK_SPECIES,
  LIVESTOCK_SEX,
  PRODUCE_UNIT,
  EQUIPMENT_CATEGORY,
  VEHICLE_TYPE,
} from "@/lib/enums";
import { isSupportedCountry, PILOT_COUNTRY, REGIONS, type RegionLabels } from "@/lib/regions";

// "Province is required" is the right sentence in Zimbabwe and the wrong one
// in Kenya, where the word is County. The two location messages are the only
// strings whose wording depends on who is filling the form in, so the
// schemas that carry them are built per region rather than once at import.
//
// The bare `postSchema` / `profileSchema` / `signupSchema` exports keep the
// pilot's wording, so anything that has no region to hand still parses
// correctly — the labels change the message, never the validation.
const PILOT_LABELS = REGIONS[PILOT_COUNTRY].labels;

function locationShape(labels: RegionLabels) {
  return {
    province: z.string().trim().min(1, `${labels.level1} is required`),
    district: z.string().trim().min(1, `${labels.level2} is required`),
  };
}

// Absent means the pilot — the same assumption the column default makes, so
// a form or client that never learned to send it still works. But a country
// that *is* sent and isn't one we support is rejected rather than quietly
// rewritten: a party we place wrongly is one we'd format prices, dates and
// place names wrongly for ever after.
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCountry, "Select a country FarmaTrade supports")
  .default(PILOT_COUNTRY);

export const signupSchemaFor = (labels: RegionLabels = PILOT_LABELS) =>
  z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().trim().optional(),
    contactDetails: z.string().trim().optional(),
    countryCode,
    ...locationShape(labels),
    roles: z.array(z.enum(PARTY_ROLES)).min(1, "Pick at least one role"),
    farmName: z.string().trim().optional(),
    sizeHectares: z.coerce.number().positive().optional(),
    vehicleType: z.enum(VEHICLE_TYPE).optional(),
    capacityKg: z.coerce.number().positive().optional(),
    serviceRegion: z.string().trim().optional(),
  })
  .refine((data) => !data.roles.includes("FARM") || !!data.farmName, {
    message: "Farm name is required when registering a farm",
    path: ["farmName"],
  })
  .refine(
    (data) => !data.roles.includes("TRANSPORTER") || !!data.vehicleType,
    {
      message: "Vehicle type is required when offering transport",
      path: ["vehicleType"],
    },
  );

export const signupSchema = signupSchemaFor();

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const profileSchemaFor = (labels: RegionLabels = PILOT_LABELS) =>
  z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  contactDetails: z.string().trim().optional(),
  ...locationShape(labels),
  farmName: z.string().trim().optional(),
  sizeHectares: z.coerce.number().positive().optional(),
  vehicleType: z.enum(VEHICLE_TYPE).optional(),
  capacityKg: z.coerce.number().positive().optional(),
  serviceRegion: z.string().trim().optional(),
});

export const profileSchema = profileSchemaFor();

export const confirmationSchema = z.object({
  matchId: z.string().min(1),
  outcome: z.enum(["COMPLETED_GOOD", "COMPLETED_ISSUE", "DID_NOT_HAPPEN"]),
  score: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().optional(),
});

export const livestockSchema = z.object({
  id: z.string().optional(),
  species: z.enum(LIVESTOCK_SPECIES),
  breed: z.string().trim().optional(),
  sex: z.enum(LIVESTOCK_SEX),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().trim().optional(),
});

export const produceSchema = z.object({
  id: z.string().optional(),
  cropType: z.string().trim().min(1, "Crop type is required"),
  quantity: z.coerce.number().positive(),
  unit: z.enum(PRODUCE_UNIT),
  perishable: z.coerce.boolean().optional(),
  expectedHarvestDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

export const postSchemaFor = (labels: RegionLabels = PILOT_LABELS) =>
  z.object({
  type: z.enum(["HAVE", "NEED"]),
  category: z.enum(POST_CATEGORIES),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().trim().optional(),
  ...locationShape(labels),
  askingPrice: z.coerce.number().positive().optional(),
  urgent: z.coerce.boolean().optional(),
  neededBy: z.coerce.date().optional(),
  recurring: z.coerce.boolean().optional(),
  openToCrossBorder: z.coerce.boolean().optional(),
  destinationProvince: z.string().trim().optional(),
  destinationDistrict: z.string().trim().optional(),
  travelDate: z.coerce.date().optional(),
});

export const postSchema = postSchemaFor();

export const equipmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(EQUIPMENT_CATEGORY),
  condition: z.string().trim().optional(),
  available: z.coerce.boolean().optional(),
  notes: z.string().trim().optional(),
});
