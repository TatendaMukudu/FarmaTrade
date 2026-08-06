"use server";

import { logger } from "@/lib/logger";

// error.tsx boundaries are Client Components (they need the interactive
// reset() prop) and can't import server-only code directly, so a caught
// render error relays here to land in the same structured log as every
// server-side error instead of only ever reaching the browser console.
export async function reportClientError(message: string, digest?: string) {
  logger.error("client.error_boundary", { message, digest: digest ?? null });
}
