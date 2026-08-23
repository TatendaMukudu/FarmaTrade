import { redirect } from "next/navigation";
import { normalizeLegacyTradeParams } from "@/lib/trade-route";

// The Posts route is gone as a product concept. Kept as a redirect rather
// than deleted: farmers have this bookmarked, and a 404 is a worse way to
// learn a page moved than simply arriving at the new one.
export default async function LegacyPostsPage({
  searchParams,
}: PageProps<"/dashboard/posts">) {
  const params = await searchParams;
  const query = normalizeLegacyTradeParams(params).toString();
  redirect(query ? `/dashboard/trade?${query}` : "/dashboard/trade");
}
