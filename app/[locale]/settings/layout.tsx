import { Settings } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";

// Force dynamic rendering to ensure correct locale translations
export const dynamic = "force-dynamic";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function SettingsLayout({ children, params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("settings");

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{t("settings")}</h1>
        </div>
        <SettingsTabs />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
