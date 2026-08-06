import type { PostCategory } from "@/generated/prisma/client";

export const CATEGORY_EMOJI: Record<PostCategory, string> = {
  LIVESTOCK: "🐄",
  PRODUCE: "🍊",
  EQUIPMENT: "🚜",
  TRANSPORT: "🚛",
};

export function categoryEmoji(category: PostCategory): string {
  return CATEGORY_EMOJI[category] ?? "📌";
}
