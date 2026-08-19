import { redirect } from "next/navigation";

// Compatibility only. "Intent" is an implementation concept, not a farmer's
// mental model, but existing bookmarks should arrive at Trade rather than 404.
export default async function LegacyIntentPage({
  searchParams,
}: PageProps<"/dashboard/intent">) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value == null ? [] : [[key, Array.isArray(value) ? value[0] : value] as [string, string]],
    ),
  ).toString();
  redirect(query ? `/dashboard/trade?${query}` : "/dashboard/trade");
}
