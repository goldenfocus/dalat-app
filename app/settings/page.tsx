import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { LanguageSelector } from "@/components/settings/language-selector";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const t = await getTranslations("settings");

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
      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("notifications")}</CardTitle>
          <CardDescription>
            {t("notificationsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings />
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("appearance")}</CardTitle>
          <CardDescription>
            {t("appearanceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Language Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("language")}</CardTitle>
          <CardDescription>
            {t("languageDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSelector userId={user.id} currentLocale={(profile.locale as Locale) || "en"} />
        </CardContent>
      </Card>
    </div>
  );
}
