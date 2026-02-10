import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { CircleDot, Plus, Users, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Event, EventCounts } from "@/lib/types";

// Increase serverless function timeout
export const maxDuration = 60;

// ISR: Revalidate every hour for fresh content
export const revalidate = 3600;

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

// Generate for all locales
export async function generateStaticParams() {
  const locales: Locale[] = ["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"];
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized metadata for pickleball searches
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  // Localized titles and descriptions for better regional SEO
  const seoContent: Record<string, { title: string; description: string; keywords: string[] }> = {
    en: {
      title: "Pickleball in Da Lat, Vietnam | Find Games & Players",
      description: "Play pickleball in Da Lat! Find games, connect with local players, and join the growing pickleball community in Vietnam's highlands. Organize matches and discover courts.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asia", "da lat sports", "pickleball courts vietnam", "play pickleball vietnam"],
    },
    vi: {
      title: "Pickleball tại Đà Lạt, Việt Nam | Tìm trận đấu & Người chơi",
      description: "Chơi pickleball tại Đà Lạt! Tìm trận đấu, kết nối với người chơi địa phương và tham gia cộng đồng pickleball đang phát triển tại cao nguyên Việt Nam.",
      keywords: ["pickleball đà lạt", "pickleball việt nam", "chơi pickleball", "sân pickleball đà lạt"],
    },
    ko: {
      title: "달랏 피클볼 | 베트남에서 게임 & 플레이어 찾기",
      description: "달랏에서 피클볼을 플레이하세요! 게임을 찾고 현지 플레이어와 연결하세요. 베트남 고원의 성장하는 피클볼 커뮤니티에 참여하세요.",
      keywords: ["피클볼 달랏", "피클볼 베트남", "피클볼 아시아", "달랏 스포츠"],
    },
    zh: {
      title: "大叻匹克球 | 在越南找比赛和球友",
      description: "在大叻玩匹克球！寻找比赛，与当地球员联系，加入越南高原不断壮大的匹克球社区。",
      keywords: ["大叻匹克球", "越南匹克球", "亚洲匹克球", "大叻运动"],
    },
    ru: {
      title: "Пиклбол в Далате, Вьетнам | Найти игры и игроков",
      description: "Играйте в пиклбол в Далате! Найдите игры, свяжитесь с местными игроками и присоединитесь к растущему сообществу пиклбола во Вьетнаме.",
      keywords: ["пиклбол далат", "пиклбол вьетнам", "пиклбол азия"],
    },
    fr: {
      title: "Pickleball à Da Lat, Vietnam | Trouver des matchs",
      description: "Jouez au pickleball à Da Lat ! Trouvez des matchs, connectez-vous avec les joueurs locaux et rejoignez la communauté pickleball au Vietnam.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asie"],
    },
    ja: {
      title: "ダラットのピックルボール | ベトナムでゲーム＆プレイヤーを探す",
      description: "ダラットでピックルボールをプレイ！ゲームを見つけ、地元のプレイヤーとつながり、ベトナム高原のピックルボールコミュニティに参加しましょう。",
      keywords: ["ピックルボール ダラット", "ピックルボール ベトナム", "ピックルボール アジア"],
    },
    ms: {
      title: "Pickleball di Da Lat, Vietnam | Cari Permainan & Pemain",
      description: "Main pickleball di Da Lat! Cari permainan, berhubung dengan pemain tempatan dan sertai komuniti pickleball yang semakin berkembang di Vietnam.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asia"],
    },
    th: {
      title: "พิกเคิลบอลในดาลัด เวียดนาม | หาเกมและผู้เล่น",
      description: "เล่นพิกเคิลบอลในดาลัด! ค้นหาเกม เชื่อมต่อกับผู้เล่นในท้องถิ่น และเข้าร่วมชุมชนพิกเคิลบอลที่กำลังเติบโตในเวียดนาม",
      keywords: ["พิกเคิลบอล ดาลัด", "พิกเคิลบอล เวียดนาม", "พิกเคิลบอล เอเชีย"],
    },
    de: {
      title: "Pickleball in Da Lat, Vietnam | Spiele & Spieler finden",
      description: "Spielen Sie Pickleball in Da Lat! Finden Sie Spiele, verbinden Sie sich mit lokalen Spielern und treten Sie der wachsenden Pickleball-Community in Vietnam bei.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asien"],
    },
    es: {
      title: "Pickleball en Da Lat, Vietnam | Encuentra partidos y jugadores",
      description: "¡Juega pickleball en Da Lat! Encuentra partidos, conéctate con jugadores locales y únete a la creciente comunidad de pickleball en Vietnam.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asia"],
    },
    id: {
      title: "Pickleball di Da Lat, Vietnam | Cari Permainan & Pemain",
      description: "Main pickleball di Da Lat! Temukan permainan, terhubung dengan pemain lokal dan bergabunglah dengan komunitas pickleball yang berkembang di Vietnam.",
      keywords: ["pickleball da lat", "pickleball vietnam", "pickleball asia"],
    },
  };

  const content = seoContent[locale] || seoContent.en;
  const baseUrl = "https://dalat.app";

  return {
    title: content.title,
    description: content.description,
    keywords: content.keywords,
    alternates: {
      canonical: `${baseUrl}/${locale}/pickleball`,
      languages: Object.fromEntries(
        Object.keys(seoContent).map((l) => [l, `${baseUrl}/${l}/pickleball`])
      ),
    },
    openGraph: {
      title: content.title,
      description: content.description,
      url: `${baseUrl}/${locale}/pickleball`,
      siteName: "ĐàLạt.app",
      locale: locale === "vi" ? "vi_VN" : locale === "en" ? "en_US" : locale,
      type: "website",
    },
  };
}

async function getPickleballEvents() {
  const supabase = await createClient();

  // Get events tagged with pickleball OR sports (to catch general sports events too)
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .or("ai_tags.cs.{pickleball},ai_tags.cs.{sports}")
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching pickleball events:", error);
    return [];
  }

  return events as Event[];
}

async function getEventCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = await createClient();
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("event_id, status, plus_ones")
    .in("event_id", eventIds);

  const counts: Record<string, EventCounts> = {};

  for (const eventId of eventIds) {
    const eventRsvps = rsvps?.filter((r) => r.event_id === eventId) || [];
    const goingRsvps = eventRsvps.filter((r) => r.status === "going");
    const waitlistRsvps = eventRsvps.filter((r) => r.status === "waitlist");
    const interestedRsvps = eventRsvps.filter((r) => r.status === "interested");

    counts[eventId] = {
      event_id: eventId,
      going_count: goingRsvps.length,
      waitlist_count: waitlistRsvps.length,
      going_spots: goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0),
      interested_count: interestedRsvps.length,
    };
  }

  return counts;
}

export default async function PickleballPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("pickleball");
  const events = await getPickleballEvents();
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  // Rich structured data for SEO
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("title"), url: "/pickleball" },
    ],
    locale
  );

  // SportsActivityLocation schema for rich results
  const sportsSchema = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: t("schemaName"),
    description: t("schemaDescription"),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Da Lat",
      addressRegion: "Lam Dong",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 11.9404,
      longitude: 108.4583,
    },
    sport: ["Tennis", "Badminton", "Racket Sports"],
    url: `https://dalat.app/${locale}/pb`,
  };

  // ItemList for event listings
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("upcomingGames"),
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://dalat.app/${locale}/events/${event.slug}`,
      name: event.title,
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, sportsSchema, itemListSchema]} />

      <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950 dark:to-emerald-900 border-b">
          <div className="container max-w-4xl mx-auto px-4 py-12">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-4 rounded-2xl bg-white/80 dark:bg-black/20 shadow-sm">
                <CircleDot className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
                <p className="text-lg text-muted-foreground">{t("subtitle")}</p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>{events.length} {t("upcomingGames")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>Da Lat, Vietnam</span>
              </div>
            </div>

            {/* CTA */}
            <Button asChild size="lg" className="gap-2">
              <Link href="/events/new">
                <Plus className="w-4 h-4" />
                {t("createGame")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Info section for SEO content */}
          <div className="mb-8 p-6 bg-muted/30 rounded-xl">
            <h2 className="text-lg font-semibold mb-3">{t("aboutTitle")}</h2>
            <p className="text-muted-foreground mb-4">{t("aboutContent")}</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm">Tennis</span>
              <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm">Badminton</span>
              <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-sm">{t("paddleSports")}</span>
            </div>
          </div>

          {/* Events section */}
          <h2 className="text-xl font-semibold mb-4">{t("upcomingGames")}</h2>

          {events.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} counts={counts[event.id]} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <div className="mb-4 flex justify-center">
                <div className="p-4 rounded-full bg-muted/30">
                  <CircleDot className="w-12 h-12 text-muted-foreground/50" />
                </div>
              </div>
              <p className="mb-2 font-medium">{t("noGames")}</p>
              <p className="mb-6 text-sm">{t("beFirst")}</p>
              <Button asChild variant="outline" className="gap-2">
                <Link href="/events/new">
                  <Plus className="w-4 h-4" />
                  {t("createGame")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
