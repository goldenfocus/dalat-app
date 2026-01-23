import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/god-mode";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import type { Profile } from "@/lib/types";

// Force dynamic rendering to ensure correct locale translations
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { user, profile } = await getEffectiveUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <div className="space-y-6">
      <ProfileEditForm profile={profile as Profile} />
    </div>
  );
}
