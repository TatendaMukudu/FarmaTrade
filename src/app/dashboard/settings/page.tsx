import { getCurrentParty } from "@/lib/auth";
import { ProfileForm } from "./form";

export default async function SettingsPage() {
  const party = await getCurrentParty();
  if (!party) return null;

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">
          Update your profile details.
        </p>
      </div>
      <ProfileForm party={party} />
    </div>
  );
}
