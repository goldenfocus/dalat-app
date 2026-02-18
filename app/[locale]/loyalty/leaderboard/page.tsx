import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locales } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { LeaderboardFull } from "@/components/loyalty/leaderboard-full";
import type { Locale } from "@/lib/types";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  return generateLocalizedMetadata({
    locale,
    path: "/loyalty/leaderboard",
    title: locale === "vi" ? "Bảng Xếp Hạng" : "Leaderboard",
    description:
      locale === "vi"
        ? "Xem ai đang dẫn đầu cộng đồng Đà Lạt. Top 50 thành viên tích cực nhất."
        : "See who's leading the Da Lat community. Top 50 most active members.",
    keywords: ["leaderboard", "ranking", "community", "Dalat", "points"],
  });
}

export default async function LeaderboardPage({ params }: PageProps) {
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
      <h1 className="text-2xl font-bold mb-1">{t("leaderboard")}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {locale === "vi"
          ? "Ai dang dẫn đầu trong cộng đồng Đà Lạt?"
          : "Who's leading the Dalat community?"}
      </p>
      <LeaderboardFull userId={userId} />
    </main>
  );
}
