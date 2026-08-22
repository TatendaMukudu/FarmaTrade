import { permanentRedirect } from "next/navigation";
import { legacyDirectoryTarget } from "@/lib/network-route";

export default async function LegacyDirectoryProfilePage({
  params,
}: PageProps<"/dashboard/directory/[partyId]">) {
  const { partyId } = await params;
  permanentRedirect(legacyDirectoryTarget([partyId]));
}
