import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locales } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { LoyaltyDashboard } from "@/components/loyalty/loyalty-dashboard";
import type { Locale } from "@/lib/types";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "loyalty" });

  return generateLocalizedMetadata({
    locale,
    path: "/loyalty",
    title: t("title"),
    description: t("subtitle"),
    keywords: ["loyalty", "rewards", "points", "leaderboard", "Dalat"],
  });
}

export default async function LoyaltyPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Get current user for the dashboard
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not authenticated, render guest view
  }

  const t = await getTranslations("loyalty");

  return (
    <main>
      <h1 className="text-2xl font-bold mb-1">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {t("subtitle")}
      </p>
      <LoyaltyDashboard userId={userId} />
    </main>
  );
}
