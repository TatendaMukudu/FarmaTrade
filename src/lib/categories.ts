import { PostCategory } from "@/generated/prisma/enums";

// The one place the list of post categories exists. Everywhere else that
// needs "all categories" (a Zod enum, a <select>, a Set for validating a
// query param) reads this instead of re-typing the literal list — adding a
// category is a schema change plus one new line here, not five files.
export const POST_CATEGORIES = Object.values(PostCategory);

export const CATEGORY_LABEL: Record<PostCategory, string> = {
  LIVESTOCK: "Livestock",
  PRODUCE: "Produce",
  EQUIPMENT: "Equipment",
  TRANSPORT: "Transport",
  INPUTS: "Seed, fertilizer & supplies",
};

// Icons live in components/icons.tsx — see CategoryIcon there. This module
// stays free of JSX so it can be imported from server code, actions and
// tests without dragging React in.
