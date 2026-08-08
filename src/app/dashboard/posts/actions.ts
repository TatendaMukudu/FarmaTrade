"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { postSchemaFor } from "@/lib/validation";
import { regionFor } from "@/lib/regions";
import { generateMatchesForPost } from "@/lib/matching";
import { uploadPhoto } from "@/lib/storage";
import type { PostType, PostCategory } from "@/generated/prisma/client";

export type PostActionState = { error?: string };

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export async function createPost(
  _prevState: PostActionState,
  formData: FormData,
): Promise<PostActionState> {
  const party = await getCurrentParty();
  if (!party) {
    return { error: "Not signed in" };
  }

  const photoFiles = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (photoFiles.length > MAX_PHOTOS) {
    return { error: `Please attach at most ${MAX_PHOTOS} photos` };
  }
  for (const file of photoFiles) {
    if (!file.type.startsWith("image/")) {
      return { error: "Photos must be image files" };
    }
    if (file.size > MAX_PHOTO_BYTES) {
      return { error: `Each photo must be under ${MAX_PHOTO_BYTES / (1024 * 1024)}MB` };
    }
  }

  const parsed = postSchemaFor(regionFor(party.countryCode).labels).safeParse({
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
    recurring: formData.get("recurring") === "on",
    openToCrossBorder: formData.get("openToCrossBorder") === "on",
    destinationProvince: formData.get("destinationProvince") || undefined,
    destinationDistrict: formData.get("destinationDistrict") || undefined,
    travelDate: formData.get("travelDate") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  const post = await prisma.post.create({
    data: {
      partyId: party.id,
      // Denormalized from the party, exactly as province/district are: a
      // post belongs to wherever its poster is.
      countryCode: party.countryCode,
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
      recurring: data.recurring ?? false,
      openToCrossBorder: data.openToCrossBorder ?? false,
      destinationProvince: data.destinationProvince,
      destinationDistrict: data.destinationDistrict,
      travelDate: data.travelDate,
    },
  });

  if (photoFiles.length > 0) {
    await prisma.photo.createMany({
      data: await Promise.all(
        photoFiles.map(async (file) => {
          const storageKey = `posts/${post.id}/${randomUUID()}`;
          const bytes = Buffer.from(await file.arrayBuffer());
          await uploadPhoto(storageKey, bytes, file.type);
          return { postId: post.id, mimeType: file.type, storageKey };
        }),
      ),
    });
  }

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

export async function confirmDraftPost(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const post = await prisma.post.findFirst({ where: { id, partyId: party.id, status: "DRAFT" } });
  if (!post) return;

  await prisma.post.update({ where: { id }, data: { status: "OPEN" } });
  await generateMatchesForPost(id);

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard");
}

export async function discardDraftPost(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  await prisma.post.deleteMany({ where: { id, partyId: party.id, status: "DRAFT" } });

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard");
}
