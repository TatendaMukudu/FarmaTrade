import { z } from "zod";
import { POST_CATEGORIES } from "@/lib/categories";
import { ALL_CAPABILITIES } from "@/lib/capabilities";
import { ALL_OBJECTIVES } from "@/lib/objectives";
import {
  LIVESTOCK_SPECIES,
  LIVESTOCK_SEX,
  PRODUCE_UNIT,
  EQUIPMENT_CATEGORY,
  VEHICLE_TYPE,
} from "@/lib/enums";

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().trim().optional(),
    contactDetails: z.string().trim().optional(),
    province: z.string().trim().min(1, "Province is required"),
    district: z.string().trim().min(1, "District is required"),
    capabilities: z
      .array(z.enum(ALL_CAPABILITIES))
      .min(1, "Pick at least one thing you do"),
    farmName: z.string().trim().optional(),
    sizeHectares: z.coerce.number().positive().optional(),
    vehicleType: z.enum(VEHICLE_TYPE).optional(),
    capacityKg: z.coerce.number().positive().optional(),
    serviceRegion: z.string().trim().optional(),
  })
  .refine((data) => !data.capabilities.includes("FARMER") || !!data.farmName, {
    message: "Farm name is required when registering a farm",
    path: ["farmName"],
  })
  .refine(
    (data) => !data.capabilities.includes("TRANSPORTER") || !!data.vehicleType,
    {
      message: "Vehicle type is required when offering transport",
      path: ["vehicleType"],
    },
  );

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  contactDetails: z.string().trim().optional(),
  province: z.string().trim().min(1, "Province is required"),
  district: z.string().trim().min(1, "District is required"),
  capabilities: z.array(z.enum(ALL_CAPABILITIES)).min(1, "Pick at least one thing you do"),
  operatingRadiusKm: z.coerce.number().int().positive().max(2000).optional(),
  languages: z.array(z.string().trim()).optional(),
  licenses: z.array(z.string().trim()).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(90).optional(),
  availabilityNote: z.string().trim().optional(),
  farmName: z.string().trim().optional(),
  sizeHectares: z.coerce.number().positive().optional(),
  vehicleType: z.enum(VEHICLE_TYPE).optional(),
  capacityKg: z.coerce.number().positive().optional(),
  serviceRegion: z.string().trim().optional(),
});

export const confirmationSchema = z.object({
  matchId: z.string().min(1),
  outcome: z.enum(["COMPLETED_GOOD", "COMPLETED_ISSUE", "DID_NOT_HAPPEN"]),
  score: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().optional(),
  // Per-dimension detail, all optional: a rater who only moves the overall
  // slider still produces a valid rating. Forcing six answers to log one
  // trade is how a rating flow gets abandoned halfway.
  communication: z.coerce.number().int().min(1).max(5).optional(),
  reliability: z.coerce.number().int().min(1).max(5).optional(),
  quality: z.coerce.number().int().min(1).max(5).optional(),
  payment: z.coerce.number().int().min(1).max(5).optional(),
  timeliness: z.coerce.number().int().min(1).max(5).optional(),
  fairness: z.coerce.number().int().min(1).max(5).optional(),
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

export const postSchema = z.object({
  // The objective is what the user actually picks; `type` and the default
  // category are derived from it (see objectives.ts) rather than asked for
  // separately — the composer's question is "what are you trying to do",
  // and HAVE/NEED is an implementation detail of the answer.
  objective: z.enum(ALL_OBJECTIVES.map((o) => o.objective) as [string, ...string[]]),
  category: z.enum(POST_CATEGORIES),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().trim().optional(),
  province: z.string().trim().min(1, "Province is required"),
  district: z.string().trim().min(1, "District is required"),
  askingPrice: z.coerce.number().positive().optional(),
  // Freeform like `unit` — CURRENCIES in zimbabwe.ts is a suggested list
  // for the form, not a constraint enforced here.
  currency: z.string().trim().optional(),
  urgent: z.coerce.boolean().optional(),
  neededBy: z.coerce.date().optional(),
  recurring: z.coerce.boolean().optional(),
  destinationProvince: z.string().trim().optional(),
  destinationDistrict: z.string().trim().optional(),
  travelDate: z.coerce.date().optional(),
});

export const equipmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(EQUIPMENT_CATEGORY),
  condition: z.string().trim().optional(),
  available: z.coerce.boolean().optional(),
  notes: z.string().trim().optional(),
});
