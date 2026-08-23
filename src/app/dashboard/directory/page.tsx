import { permanentRedirect } from "next/navigation";
import { legacyDirectoryTarget } from "@/lib/network-route";

export default async function LegacyDirectoryPage({
  searchParams,
}: PageProps<"/dashboard/directory">) {
  const params = await searchParams;
  const roleValue = Array.isArray(params.role) ? params.role[0] : params.role;
  const role = typeof roleValue === "string" ? `?role=${encodeURIComponent(roleValue)}` : "";
  permanentRedirect(`${legacyDirectoryTarget([])}${role}`);
}
