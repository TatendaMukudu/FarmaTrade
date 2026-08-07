"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { postSchema } from "@/lib/validation";
import { generateMatchesForPost } from "@/lib/matching";
import { uploadPhoto, deletePhoto } from "@/lib/storage";
import { detectImageFormat, ACCEPTED_IMAGE_FORMATS } from "@/lib/image-validation";
import { logger } from "@/lib/logger";
import { objectiveSpec } from "@/lib/objectives";
import type { Objective, PostCategory } from "@/generated/prisma/client";

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

  // Read each file once, up front, and decide its type from its own bytes.
  // `file.type` is whatever the browser was told to send and is not
  // evidence of anything — trusting it let an SVG through, which then came
  // back out of the photo route as image/svg+xml and executed its own
  // <script> on our origin.
  const validatedPhotos: { bytes: Buffer; contentType: string }[] = [];
  for (const file of photoFiles) {
    if (file.size > MAX_PHOTO_BYTES) {
      return { error: `Each photo must be under ${MAX_PHOTO_BYTES / (1024 * 1024)}MB` };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const format = detectImageFormat(bytes);
    if (!format) {
      logger.warn("createPost.rejected_upload", {
        partyId: party.id,
        claimedType: file.type,
        size: file.size,
      });
      return { error: `Photos must be ${ACCEPTED_IMAGE_FORMATS} images` };
    }
    validatedPhotos.push({ bytes, contentType: format });
  }

  const parsed = postSchema.safeParse({
    objective: formData.get("objective"),
    category: formData.get("category"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    quantity: formData.get("quantity") || undefined,
    unit: formData.get("unit") || undefined,
    province: formData.get("province"),
    district: formData.get("district"),
    askingPrice: formData.get("askingPrice") || undefined,
    currency: formData.get("currency") || undefined,
    urgent: formData.get("urgent") === "on",
    neededBy: formData.get("neededBy") || undefined,
    recurring: formData.get("recurring") === "on",
    destinationProvince: formData.get("destinationProvince") || undefined,
    destinationDistrict: formData.get("destinationDistrict") || undefined,
    travelDate: formData.get("travelDate") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;
  // Derived, never asked for separately: the objective already determines
  // which way round the matching engine pairs this, and a form that let a
  // user set both could produce a "selling" post filed as a need.
  const objective = data.objective as Objective;
  const spec = objectiveSpec(objective);

  const post = await prisma.post.create({
    data: {
      partyId: party.id,
      objective,
      type: spec.type,
      category: data.category as PostCategory,
      title: data.title,
      description: data.description,
      quantity: data.quantity,
      unit: data.unit,
      province: data.province,
      district: data.district,
      askingPrice: data.askingPrice,
      currency: data.currency,
      urgent: data.urgent ?? false,
      neededBy: data.neededBy,
      recurring: data.recurring ?? false,
      destinationProvince: data.destinationProvince,
      destinationDistrict: data.destinationDistrict,
      travelDate: data.travelDate,
    },
  });

  if (validatedPhotos.length > 0) {
    await prisma.photo.createMany({
      data: await Promise.all(
        validatedPhotos.map(async (photo) => {
          const storageKey = `posts/${post.id}/${randomUUID()}`;
          // The sniffed type is stored and uploaded, never the claimed one.
          await uploadPhoto(storageKey, photo.bytes, photo.contentType);
          return { postId: post.id, mimeType: photo.contentType, storageKey };
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

// Postgres cascade (Photo.post onDelete: Cascade) cleans up the Photo
// rows automatically when a Post is deleted, but it can't reach out to
// R2 — those objects have to be deleted in application code, before the
// DB delete, or they leak forever, still billed, with nothing left in
// Postgres pointing at them.
async function deletePostPhotos(postId: string) {
  const photos = await prisma.photo.findMany({
    where: { postId, storageKey: { not: null } },
    select: { storageKey: true },
  });
  await Promise.all(
    photos.map((p) => deletePhoto(p.storageKey!)),
  );
}

export async function discardDraftPost(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const post = await prisma.post.findFirst({ where: { id, partyId: party.id, status: "DRAFT" } });
  if (!post) return;

  await deletePostPhotos(id);
  await prisma.post.delete({ where: { id } });

  revalidatePath("/dashboard/posts");
  revalidatePath("/dashboard");
}
