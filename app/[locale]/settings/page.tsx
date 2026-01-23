import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getEffectiveUser } from "@/lib/god-mode";

// Force dynamic rendering to ensure correct locale translations
export const dynamic = "force-dynamic";

// Increase serverless function timeout
export const maxDuration = 60;
import { ThemeSelector } from "@/components/settings/theme-selector";
import { LanguageSelector } from "@/components/settings/language-selector";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { PasswordSettings } from "@/components/settings/password-settings";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/lib/types";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const { user, profile, godMode } = await getEffectiveUser();

  if (!user) {
    redirect("/auth/login");
  }

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

      {/* Account Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("account")}</CardTitle>
          <CardDescription>
            {t("accountDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasswordSettings
            userEmail={user.email || ""}
            targetUserId={godMode.isActive ? godMode.targetUserId : null}
          />
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
