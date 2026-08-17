import { redirect } from "next/navigation";

// The Posts route is gone as a product concept. Kept as a redirect rather
// than deleted: farmers have this bookmarked, and a 404 is a worse way to
// learn a page moved than simply arriving at the new one.
export default async function LegacyPostsPage({
  searchParams,
}: PageProps<"/dashboard/posts">) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      v == null ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]],
    ),
  ).toString();
  redirect(query ? `/dashboard/trade?${query}` : "/dashboard/trade");
}
