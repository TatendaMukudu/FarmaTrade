import { PostCategory } from "@/generated/prisma/enums";

// The one place the list of post categories exists. Everywhere else that
// needs "all categories" (a Zod enum, a <select>, a Set for validating a
// query param) reads this instead of re-typing the literal list — adding a
// category is a schema change plus one new line here, not five files.
export const POST_CATEGORIES = Object.values(PostCategory);

export const CATEGORY_EMOJI: Record<PostCategory, string> = {
  LIVESTOCK: "🐄",
  PRODUCE: "🍊",
  EQUIPMENT: "🚜",
  TRANSPORT: "🚛",
  INPUTS: "🛒",
  LABOR: "👷",
  STORAGE: "🏬",
  FINANCE: "🏦",
  SERVICES: "🛠️",
};

export const CATEGORY_LABEL: Record<PostCategory, string> = {
  LIVESTOCK: "Livestock",
  PRODUCE: "Produce",
  EQUIPMENT: "Equipment",
  TRANSPORT: "Transport",
  INPUTS: "Seed, fertilizer & supplies",
  LABOR: "Labour",
  STORAGE: "Storage & cold chain",
  FINANCE: "Finance & insurance",
  SERVICES: "Repairs & services",
};

export function categoryEmoji(category: PostCategory): string {
  return CATEGORY_EMOJI[category] ?? "📌";
}
