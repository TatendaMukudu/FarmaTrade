"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentParty } from "@/lib/auth";
import { intentSchemaFor } from "@/lib/validation";
import { regionFor } from "@/lib/regions";
import { normalizeProductTerm, subjectFromTitle } from "@/lib/products";
import { generateMatchesForIntent } from "@/lib/matching";
import { uploadPhoto } from "@/lib/storage";
import type { IntentSide, CommerceCategory } from "@/generated/prisma/client";

// The canonical product a new post is about, or null when we can't tell.
// Null is a normal outcome, not a failure: matching falls back to category,
// which is what it always did.
async function resolvePostProduct(
  inventory: { produceId?: string; livestockId?: string },
  title: string,
): Promise<string | null> {
  if (inventory.produceId) {
    const row = await prisma.produceStock.findUnique({
      where: { id: inventory.produceId },
      select: { productId: true },
    });
    if (row?.productId) return row.productId;
  }
  if (inventory.livestockId) {
    const row = await prisma.livestock.findUnique({
      where: { id: inventory.livestockId },
      select: { species: true },
    });
    if (row) {
      const alias = await prisma.productAlias.findUnique({
        where: { normalized: normalizeProductTerm(row.species) },
        select: { productId: true },
      });
      if (alias) return alias.productId;
    }
  }
  // Whole title first, then with a leading quantity stripped — "20 tonnes
  // of maize" is a shape FarmaTrade writes itself.
  for (const term of [title, subjectFromTitle(title)]) {
    const alias = await prisma.productAlias.findUnique({
      where: { normalized: normalizeProductTerm(term) },
      select: { productId: true },
    });
    if (alias) return alias.productId;
  }
  return null;
}

// Verifies the referenced row is actually this party's before linking it —
// the reference arrives from a form field, so it is a client-supplied id and
// gets treated as one.
async function resolveInventoryRef(
  ref: string | undefined,
  partyId: string,
): Promise<{ produceId?: string; livestockId?: string; equipmentId?: string }> {
  if (!ref) return {};
  const [kind, id] = ref.split(":");

  if (kind === "produce") {
    const row = await prisma.produceStock.findFirst({
      where: { id, farm: { partyId } },
      select: { id: true },
    });
    return row ? { produceId: row.id } : {};
  }
  if (kind === "livestock") {
    const row = await prisma.livestock.findFirst({
      where: { id, farm: { partyId } },
      select: { id: true },
    });
    return row ? { livestockId: row.id } : {};
  }
  const row = await prisma.equipment.findFirst({
    where: { id, farm: { partyId } },
    select: { id: true },
  });
  return row ? { equipmentId: row.id } : {};
}

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

  const parsed = intentSchemaFor(regionFor(party.countryCode).labels).safeParse({
    side: formData.get("side"),
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
    inventoryRef: formData.get("inventoryRef") || undefined,
    destinationProvince: formData.get("destinationProvince") || undefined,
    destinationDistrict: formData.get("destinationDistrict") || undefined,
    travelDate: formData.get("travelDate") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  // Linking a post to the inventory row it came from is what lets the rest
  // of the app use the farmer's own name for the thing. Price signals group
  // on ProduceStock.cropType, which is free text — so a farmer who records
  // their crop as "Mhunga" or "Nyimo" gets price lines in those words rather
  // than a generic "Produce". Without the link there is nothing to read but
  // a free-text title, which is not something to group on.
  const inventory = await resolveInventoryRef(data.inventoryRef, party.id);

  // What this post is actually about. The inventory row is the better
  // source — the farmer already told us what that is — with the title as a
  // fallback for a post typed from scratch.
  const productId = await resolvePostProduct(inventory, data.title);

  const intent = await prisma.intent.create({
    data: {
      partyId: party.id,
      // Denormalized from the party, exactly as province/district are: a
      // post belongs to wherever its poster is.
      countryCode: party.countryCode,
      side: data.side as IntentSide,
      category: data.category as CommerceCategory,
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
      productId,
      // Authored by hand, so it is ACTIVE immediately. Asking someone to
      // approve what they just wrote is friction with no purpose — the
      // PROPOSED step exists only for things FarmaTrade inferred.
      origin: "DECLARED",
      status: "ACTIVE",
      ...inventory,
      destinationProvince: data.destinationProvince,
      destinationDistrict: data.destinationDistrict,
      travelDate: data.travelDate,
    },
  });

  if (photoFiles.length > 0) {
    await prisma.photo.createMany({
      data: await Promise.all(
        photoFiles.map(async (file) => {
          // Key prefix stays "posts/" deliberately. Every photo already in
          // R2 lives under it, and renaming the prefix would orphan them
          // all — the bucket has no idea the concept was renamed.
          const storageKey = `posts/${intent.id}/${randomUUID()}`;
          const bytes = Buffer.from(await file.arrayBuffer());
          await uploadPhoto(storageKey, bytes, file.type);
          return { intentId: intent.id, mimeType: file.type, storageKey };
        }),
      ),
    });
  }

  await generateMatchesForIntent(intent.id);

  revalidatePath("/dashboard/intent");
  revalidatePath("/dashboard/opportunities");
  return {};
}

export async function closePost(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  await prisma.intent.updateMany({
    where: { id, partyId: party.id },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath("/dashboard/intent");
  revalidatePath("/dashboard/opportunities");
}

export async function confirmProposedIntent(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  const intent = await prisma.intent.findFirst({
    where: { id, partyId: party.id, status: "PROPOSED" },
  });
  if (!intent) return;

  // The moment ownership transfers. From here the derivation engine will
  // not revise this intent again — if the source moves, the farmer is told
  // rather than overruled.
  await prisma.intent.update({ where: { id }, data: { status: "ACTIVE" } });
  await generateMatchesForIntent(id);

  revalidatePath("/dashboard/intent");
  revalidatePath("/dashboard/opportunities");
  revalidatePath("/dashboard");
}

// "Not selling this."
//
// Withdraws rather than deletes, and that is the whole mechanism: the
// withdrawn row keeps its derivationKey, and the derivation engine refuses
// to re-propose anything whose key still matches. Deleting it would leave
// nothing to remember the refusal by, and the next page load would cheerfully
// suggest the same thing again — which is how "proactive" becomes "nagging"
// within about a day.
//
// If the underlying harvest genuinely changes, the key changes with it, and
// asking again is then a fair question rather than a repeat of one already
// answered.
export async function declineProposedIntent(formData: FormData) {
  const party = await getCurrentParty();
  if (!party) return;

  const id = String(formData.get("id"));
  await prisma.intent.updateMany({
    where: { id, partyId: party.id, status: "PROPOSED", origin: "DERIVED" },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath("/dashboard/intent");
  revalidatePath("/dashboard");
}
