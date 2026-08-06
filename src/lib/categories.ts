import type { PostCategory } from "@/generated/prisma/client";

export const CATEGORY_EMOJI: Record<PostCategory, string> = {
  LIVESTOCK: "🐄",
  PRODUCE: "🍊",
  EQUIPMENT: "🚜",
  TRANSPORT: "🚛",
  INPUTS: "🛒",
};

export const CATEGORY_LABEL: Record<PostCategory, string> = {
  LIVESTOCK: "Livestock",
  PRODUCE: "Produce",
  EQUIPMENT: "Equipment",
  TRANSPORT: "Transport",
  INPUTS: "Seed, fertilizer & supplies",
};

export function categoryEmoji(category: PostCategory): string {
  return CATEGORY_EMOJI[category] ?? "📌";
}
