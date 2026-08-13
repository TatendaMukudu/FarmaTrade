// Turning stored terms rows into the shape the domain rules read.
//
// Its own module rather than a helper inside agreement.ts because pages need
// it too, and agreement.ts is `server-only` for the write path. Pure: the
// only thing it does is convert Prisma's Decimal to a number and flatten
// acceptances to party ids.

import type { TermsVersion } from "@/lib/agreement-core";

type StoredTerms = {
  id: string;
  version: number;
  quantity: number | null;
  unit: string | null;
  price: unknown;
  handoverOn: Date | null;
  proposedById: string;
  acceptances: { partyId: string }[];
};

export function toTermsVersions(rows: readonly StoredTerms[]): TermsVersion[] {
  return rows.map((t) => ({
    id: t.id,
    version: t.version,
    quantity: t.quantity,
    unit: t.unit,
    price: t.price == null ? null : Number(t.price),
    handoverOn: t.handoverOn,
    proposedById: t.proposedById,
    acceptedBy: t.acceptances.map((a) => a.partyId),
  }));
}
