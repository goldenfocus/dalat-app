import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocales } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { RewardsCatalog } from "@/components/loyalty/rewards-catalog";
import type { Locale } from "@/lib/types";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "loyalty" });

  return generateLocalizedMetadata({
    locale,
    path: "/loyalty/rewards",
    title: t("rewards"),
    description: t("rewardsMetaDescription"),
    keywords: ["rewards", "perks", "badges", "redeem", "points", "Dalat"],
  });
}

export default async function RewardsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("loyalty");

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not authenticated
  }

  return (
    <main>
      <h1 className="text-2xl font-bold mb-1">{t("rewards")}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {t("rewardsSubtitle")}
      </p>
      <RewardsCatalog userId={userId} />
    </main>
  );
}
