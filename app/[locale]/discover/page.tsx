import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/lib/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createStaticClient } from "@/lib/supabase/server";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema, generateWebSiteSchema } from "@/lib/structured-data";
import { locales } from "@/lib/i18n/routing";
import {
  Coffee, Wine, UtensilsCrossed, Palette, TreePine, Building2,
  Laptop, Home, Mountain, Music, Camera, CalendarDays, MapPin,
} from "lucide-react";
import type { Locale } from "@/lib/types";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const title = locale === "vi"
    ? "Khám Phá Đà Lạt - Sự Kiện, Địa Điểm, Khoảnh Khắc"
    : "Discover Da Lat - Events, Venues, Moments & More";

  const description = locale === "vi"
    ? "Khám phá Đà Lạt: sự kiện hôm nay, quán cafe, nhà hàng, nhạc sống, nghệ thuật, và khoảnh khắc từ cộng đồng. Cập nhật mỗi ngày."
    : "Discover Da Lat: today's events, cafes, restaurants, live music, art, and authentic moments from the community. Updated daily.";

  return generateLocalizedMetadata({
    locale,
    path: "/discover",
    title,
    description,
    keywords: [
      "Đà Lạt", "Da Lat", "Dalat",
      "things to do in Dalat", "Dalat events", "Dalat cafes",
      "Dalat nightlife", "Dalat music", "Dalat food",
      "du lịch Đà Lạt", "sự kiện Đà Lạt", "quán cafe Đà Lạt",
      "Dalat travel guide", "what to do in Dalat",
    ],
  });
}

const VENUE_TYPES = [
  { slug: "cafes", icon: Coffee, en: "Cafes", vi: "Quán Cà Phê", color: "bg-amber-500/10 text-amber-600" },
  { slug: "bars", icon: Wine, en: "Bars", vi: "Quán Bar", color: "bg-purple-500/10 text-purple-600" },
  { slug: "restaurants", icon: UtensilsCrossed, en: "Restaurants", vi: "Nhà Hàng", color: "bg-red-500/10 text-red-600" },
  { slug: "galleries", icon: Palette, en: "Galleries", vi: "Phòng Tranh", color: "bg-pink-500/10 text-pink-600" },
  { slug: "parks", icon: TreePine, en: "Parks", vi: "Công Viên", color: "bg-green-500/10 text-green-600" },
  { slug: "hotels", icon: Building2, en: "Hotels", vi: "Khách Sạn", color: "bg-blue-500/10 text-blue-600" },
  { slug: "coworking", icon: Laptop, en: "Coworking", vi: "Coworking", color: "bg-indigo-500/10 text-indigo-600" },
  { slug: "homestays", icon: Home, en: "Homestays", vi: "Homestay", color: "bg-teal-500/10 text-teal-600" },
  { slug: "outdoor", icon: Mountain, en: "Outdoor", vi: "Ngoài Trời", color: "bg-emerald-500/10 text-emerald-600" },
];

const DISCOVERY_LINKS = [
  { href: "/tonight", en: "What's On Tonight", vi: "Hôm Nay", icon: CalendarDays },
  { href: "/this-weekend", en: "This Weekend", vi: "Cuối Tuần Này", icon: CalendarDays },
  { href: "/moments", en: "Photos & Videos", vi: "Ảnh & Video", icon: Camera },
  { href: "/map", en: "Map", vi: "Bản Đồ", icon: MapPin },
  { href: "/festivals", en: "Festivals", vi: "Lễ Hội", icon: Music },
];

async function DiscoverStats({ locale }: { locale: Locale }) {
  const supabase = createStaticClient();
  if (!supabase) return null;

  const [
    { count: eventCount },
    { count: venueCount },
    { count: momentCount },
  ] = await Promise.all([
    supabase.from("events").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("venues").select("*", { count: "exact", head: true }),
    supabase.from("moments").select("*", { count: "exact", head: true }).eq("status", "published"),
  ]);

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="text-center p-4 rounded-xl bg-primary/5">
        <p className="text-2xl font-bold text-primary">{eventCount || 0}+</p>
        <p className="text-sm text-muted-foreground">{locale === "vi" ? "Sự kiện" : "Events"}</p>
      </div>
      <div className="text-center p-4 rounded-xl bg-primary/5">
        <p className="text-2xl font-bold text-primary">{venueCount || 0}+</p>
        <p className="text-sm text-muted-foreground">{locale === "vi" ? "Địa điểm" : "Venues"}</p>
      </div>
      <div className="text-center p-4 rounded-xl bg-primary/5">
        <p className="text-2xl font-bold text-primary">{momentCount || 0}+</p>
        <p className="text-sm text-muted-foreground">{locale === "vi" ? "Khoảnh khắc" : "Moments"}</p>
      </div>
    </div>
  );
}

export default async function DiscoverPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isVi = locale === "vi";

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "https://dalat.app" },
      { name: isVi ? "Khám Phá" : "Discover", url: `https://dalat.app/${locale}/discover` },
    ],
    locale
  );

  const faqSchema = generateFAQSchema(
    isVi
      ? [
          {
            question: "Đà Lạt có gì chơi hôm nay?",
            answer: "Xem trang 'Hôm Nay' trên ĐàLạt.app để biết các sự kiện đang diễn ra, từ nhạc sống đến triển lãm nghệ thuật, workshop và nhiều hơn nữa.",
          },
          {
            question: "Quán cafe nào hay nhất ở Đà Lạt?",
            answer: "ĐàLạt.app liệt kê hàng chục quán cafe có sự kiện. Xem trang Cafes để tìm quán đang có sự kiện ngay bây giờ.",
          },
          {
            question: "Đà Lạt có nhạc sống không?",
            answer: "Có! Đà Lạt có cộng đồng nhạc sống sôi động tại các quán cafe, bar và không gian sáng tạo. Xem lịch sự kiện để biết thêm.",
          },
        ]
      : [
          {
            question: "What's happening in Da Lat today?",
            answer: "Check the 'Tonight' page on ĐàLạt.app for live events happening now, from live music to art exhibitions, workshops, and community gatherings.",
          },
          {
            question: "What are the best cafes in Da Lat?",
            answer: "ĐàLạt.app lists dozens of cafes hosting events. Visit the Cafes page to find ones with events happening right now.",
          },
          {
            question: "Is there live music in Da Lat?",
            answer: "Yes! Da Lat has a vibrant live music scene at cafes, bars, and creative spaces. Check the events calendar for upcoming performances.",
          },
        ]
  );

  return (
    <main className="min-h-screen pb-20">
      <JsonLd data={[breadcrumbSchema, faqSchema]} />

      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* SEO-optimized H1 */}
        <h1 className="text-3xl font-bold mb-2">
          {isVi ? "Khám Phá Đà Lạt" : "Discover Da Lat"}
        </h1>
        <p className="text-muted-foreground mb-6">
          {isVi
            ? "Sự kiện, địa điểm, ẩm thực và khoảnh khắc từ thành phố sương mù trên cao nguyên Việt Nam."
            : "Events, venues, food, and authentic moments from Vietnam's beloved highland city."}
        </p>

        {/* Live stats */}
        <Suspense fallback={null}>
          <DiscoverStats locale={locale} />
        </Suspense>

        {/* Quick discovery links */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">
            {isVi ? "Tìm nhanh" : "Quick Discover"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DISCOVERY_LINKS.map(({ href, en, vi, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 p-4 rounded-xl border hover:bg-muted/50 transition-colors active:scale-95"
              >
                <Icon className="w-5 h-5 text-primary" />
                <span className="font-medium text-sm">{isVi ? vi : en}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Venue types grid — SEO-rich internal links */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">
            {isVi ? "Khám phá theo loại địa điểm" : "Explore by Venue Type"}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
            {VENUE_TYPES.map(({ slug, icon: Icon, en, vi, color }) => (
              <Link
                key={slug}
                href={`/${slug}`}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border hover:bg-muted/50 transition-colors active:scale-95 text-center"
              >
                <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-medium text-sm">{isVi ? vi : en}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* SEO content section — visible to crawlers, adds keyword density */}
        <section className="prose prose-sm max-w-none text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">
            {isVi ? "Về ĐàLạt.app" : "About ĐàLạt.app"}
          </h2>
          {isVi ? (
            <p>
              ĐàLạt.app là nền tảng khám phá sự kiện và cộng đồng tại Đà Lạt, Lâm Đồng, Việt Nam.
              Từ nhạc sống ở các quán cà phê đến triển lãm nghệ thuật, workshop sáng tạo và lễ hội,
              chúng tôi giúp bạn tìm và trải nghiệm những điều tốt nhất của thành phố sương mù.
              Khám phá các sự kiện hôm nay, cuối tuần này, hoặc lên kế hoạch cho chuyến đi Đà Lạt tiếp theo.
            </p>
          ) : (
            <p>
              ĐàLạt.app is the community-powered event discovery platform for Da Lat (Đà Lạt),
              Lam Dong, Vietnam. From live music at cozy cafes to art exhibitions, creative workshops,
              and seasonal festivals, we help you find and experience the best of Vietnam&apos;s highland city.
              Discover events happening tonight, this weekend, or plan your next trip to Da Lat.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
