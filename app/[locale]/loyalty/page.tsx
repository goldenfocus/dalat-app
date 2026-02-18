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

  return generateLocalizedMetadata({
    locale,
    path: "/loyalty",
    title: locale === "vi" ? "Thành Viên Trung Thành" : "Loyalty",
    description:
      locale === "vi"
        ? "Kiếm điểm, mở khóa phần thưởng, và leo bảng xếp hạng cộng đồng Đà Lạt."
        : "Earn points, unlock rewards, and climb the Da Lat community leaderboard.",
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

  return (
    <main>
      <h1 className="text-2xl font-bold mb-1">
        {locale === "vi" ? "Thành Viên" : "Loyalty"}
      </h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {locale === "vi"
          ? "Kiếm điểm khi khám phá Đà Lạt. Đổi phần thưởng, mở khóa tính năng."
          : "Earn points as you explore Dalat. Redeem rewards, unlock perks."}
      </p>
      <LoyaltyDashboard userId={userId} />
    </main>
  );
}
