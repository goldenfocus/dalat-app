import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Settings } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AuthButton } from "@/components/auth-button";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("settings");

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-2xl items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="-ml-2 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all p-2 rounded-lg"
              aria-label="Back to home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h1 className="font-semibold">{t("settings")}</h1>
            </div>
          </div>
          <AuthButton />
        </div>
      </nav>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        <SettingsTabs />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
