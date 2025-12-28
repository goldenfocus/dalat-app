import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { LanguageSelector } from "@/components/settings/language-selector";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Profile, Locale } from "@/lib/types";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <ProfileEditForm profile={profile as Profile} />

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize how the app looks on your device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Language Section */}
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>
            Choose your preferred language for notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSelector userId={user.id} currentLocale={(profile.locale as Locale) || "en"} />
        </CardContent>
      </Card>
    </div>
  );
}
