import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/god-mode";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import type { Profile } from "@/lib/types";
import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { isPeopleEnabled } from "@/lib/people/constants";

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

  const tPeople = await getTranslations("people");

  return (
    <div className="space-y-6">
      <ProfileEditForm profile={profile as Profile} />
      {isPeopleEnabled() && (
        <Link href="/people/edit" className="flex min-h-11 items-center justify-between rounded-xl border p-4 font-medium transition-colors hover:bg-muted active:scale-[0.99]">
          {tPeople("manageProfile")}
        </Link>
      )}
    </div>
  );
}
