"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { postSchema } from "@/lib/validation";
import { generateMatchesForPost } from "@/lib/matching";
import type { PostType, PostCategory } from "@/generated/prisma/client";

export type PostActionState = { error?: string };

export async function createPost(
  _prevState: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const party = await getCurrentParty();
  if (!party) {
    return { error: "Not signed in" };
  }

  const parsed = postSchema.safeParse({
    type: formData.get("type"),
    category: formData.get("category"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
    province: formData.get("province"),
    district: formData.get("district"),
    askingPrice: formData.get("askingPrice") || undefined,
    urgent: formData.get("urgent") === "on",
    neededBy: formData.get("neededBy") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  const post = await prisma.post.create({
    data: {
      partyId: party.id,
      type: data.type as PostType,
      category: data.category as PostCategory,
      title: data.title,
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      province: data.province,
      district: data.district,
      askingPrice: data.askingPrice,
      urgent: data.urgent ?? false,
      neededBy: data.neededBy,
    },
  });

  await generateMatchesForPost(post.id);

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/opportunities");
  return {};
}

export async function closePost(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  await prisma.post.updateMany({
    where: { id, partyId: party.id },
    data: { status: "CLOSED" },
  });

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/opportunities");
}
