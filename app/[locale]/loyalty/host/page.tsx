import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locales } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { HostDashboard } from "@/components/loyalty/host-dashboard";
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
    path: "/loyalty/host",
    title: locale === "vi" ? "Phần Thưởng Cho Người Tổ Chức" : "Host Rewards",
    description:
      locale === "vi"
        ? "Mở khóa công cụ premium khi bạn tổ chức nhiều sự kiện hơn tại Đà Lạt."
        : "Unlock premium host tools as you organize more events in Da Lat.",
    keywords: ["host", "rewards", "organizer", "perks", "events", "Dalat"],
  });
}

export default async function HostRewardsPage({ params }: PageProps) {
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
      <h1 className="text-2xl font-bold mb-1">{t("hostRewards.title")}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {t("hostRewards.subtitle")}
      </p>
      <HostDashboard userId={userId} />
    </main>
  );
}
