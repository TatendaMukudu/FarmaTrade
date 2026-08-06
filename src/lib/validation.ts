import { z } from "zod";

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().trim().optional(),
    province: z.string().trim().min(1, "Province is required"),
    district: z.string().trim().min(1, "District is required"),
    roles: z
      .array(z.enum(["FARM", "TRADER", "TRANSPORTER"]))
      .min(1, "Pick at least one role"),
    farmName: z.string().trim().optional(),
    sizeHectares: z.coerce.number().positive().optional(),
    vehicleType: z
      .enum(["TRUCK", "REFRIGERATED_TRUCK", "PICKUP", "TRAILER", "OTHER"])
      .optional(),
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

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  province: z.string().trim().min(1, "Province is required"),
  district: z.string().trim().min(1, "District is required"),
  farmName: z.string().trim().optional(),
  sizeHectares: z.coerce.number().positive().optional(),
  vehicleType: z
    .enum(["TRUCK", "REFRIGERATED_TRUCK", "PICKUP", "TRAILER", "OTHER"])
    .optional(),
  capacityKg: z.coerce.number().positive().optional(),
  serviceRegion: z.string().trim().optional(),
});

export const confirmationSchema = z.object({
  matchId: z.string().min(1),
  outcome: z.enum(["COMPLETED_GOOD", "COMPLETED_ISSUE", "DID_NOT_HAPPEN"]),
  score: z.coerce.number().int().min(1).max(5).optional(),
  comment: z.string().trim().optional(),
});

export const livestockSchema = z.object({
  id: z.string().optional(),
  species: z.enum(["CATTLE", "GOAT", "SHEEP", "PIG", "POULTRY", "OTHER"]),
  breed: z.string().trim().optional(),
  sex: z.enum(["MALE", "FEMALE", "MIXED"]),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().trim().optional(),
});

export const produceSchema = z.object({
  id: z.string().optional(),
  cropType: z.string().trim().min(1, "Crop type is required"),
  quantity: z.coerce.number().positive(),
  unit: z.enum(["KG", "TONNE", "BAG", "CRATE", "LITRE", "HEAD"]),
  perishable: z.coerce.boolean().optional(),
  expectedHarvestDate: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

export const postSchema = z.object({
  type: z.enum(["HAVE", "NEED"]),
  category: z.enum(["LIVESTOCK", "PRODUCE", "EQUIPMENT", "TRANSPORT"]),
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().trim().optional(),
  province: z.string().trim().min(1, "Province is required"),
  district: z.string().trim().min(1, "District is required"),
  askingPrice: z.coerce.number().positive().optional(),
  urgent: z.coerce.boolean().optional(),
  neededBy: z.coerce.date().optional(),
  recurring: z.coerce.boolean().optional(),
});

export const equipmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(["TRACTOR", "PLOUGH", "IRRIGATION", "TRAILER", "OTHER"]),
  condition: z.string().trim().optional(),
  available: z.coerce.boolean().optional(),
  notes: z.string().trim().optional(),
});
