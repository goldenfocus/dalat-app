import { Suspense } from "react";
import { Moon } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { Link } from "@/lib/i18n/routing";
import type { Event, Locale } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema } from "@/lib/structured-data";
import { locales } from "@/lib/i18n/routing";
import { DALAT_TIMEZONE } from "@/lib/timezone";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { endOfDay, setHours, startOfDay, addDays } from "date-fns";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized for "dalat tonight" and "things to do tonight in dalat" searches
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  const now = toZonedTime(new Date(), DALAT_TIMEZONE);
  const todayStr = formatInTimeZone(now, DALAT_TIMEZONE, "EEEE, MMMM d");

  const title = locale === "vi"
    ? `Đà Lạt Tối Nay - Sự Kiện & Nightlife (${todayStr})`
    : `Da Lat Tonight - Events & Nightlife (${todayStr})`;

  const description = locale === "vi"
    ? `Khám phá các sự kiện tối nay ở Đà Lạt: nhạc sống, bar, DJ và hoạt động đêm. Cập nhật theo thời gian thực.`
    : `Discover what's happening tonight in Da Lat: live music, bars, DJs, and nightlife. Updated in real-time.`;

  return generateLocalizedMetadata({
    locale,
    path: "/tonight",
    title,
    description,
    keywords: [
      "Da Lat tonight",
      "what to do tonight in Dalat",
      "Dalat nightlife",
      "tonight in Da Lat",
      "Đà Lạt tối nay",
      "nightlife Đà Lạt",
    ],
  });
}

// Get tonight's events (from 5 PM today to 4 AM next day in Da Lat timezone)
async function getTonightEvents(): Promise<{ happening: Event[]; upcoming: Event[] }> {
  const supabase = await createClient();
  const now = toZonedTime(new Date(), DALAT_TIMEZONE);

  // Evening starts at 5 PM (17:00), ends at 4 AM next day
  const eveningStart = setHours(startOfDay(now), 17);
  const eveningEnd = setHours(startOfDay(addDays(now, 1)), 4);

  // Fetch events happening now (currently running)
  const { data: happeningData } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "happening",
    p_limit: 20,
  });

  // Fetch events starting tonight
  const { data: tonightData } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", eveningStart.toISOString())
    .lte("starts_at", eveningEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  return {
    happening: (happeningData || []) as Event[],
    upcoming: (tonightData || []) as Event[],
  };
}

function EventsLoading() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

async function TonightContent({ locale }: { locale: Locale }) {
  const { happening, upcoming } = await getTonightEvents();
  const now = toZonedTime(new Date(), DALAT_TIMEZONE);
  const todayStr = formatInTimeZone(now, DALAT_TIMEZONE, "EEEE, MMMM d");

  const totalEvents = happening.length + upcoming.length;

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Tonight", url: "/tonight" },
    ],
    locale
  );

  const eventListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Sự Kiện Tối Nay Đà Lạt" : "Da Lat Events Tonight",
    description: locale === "vi"
      ? `Các sự kiện diễn ra tối nay tại Đà Lạt (${todayStr})`
      : `Events happening tonight in Da Lat (${todayStr})`,
    numberOfItems: totalEvents,
    itemListElement: [...happening, ...upcoming].slice(0, 30).map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${SITE_URL}/${locale}/events/${event.slug}`,
      item: {
        "@type": "Event",
        name: event.title,
        startDate: event.starts_at,
        ...(event.ends_at && { endDate: event.ends_at }),
        location: {
          "@type": "Place",
          name: event.location_name || "Da Lat",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Da Lat",
            addressCountry: "VN",
          },
        },
      },
    })),
  };

  // FAQ schema for AEO - answers "what to do tonight" queries
  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Tối nay ở Đà Lạt có gì hay?",
            answer: totalEvents > 0
              ? `Có ${totalEvents} sự kiện tối nay tại Đà Lạt${happening.length > 0 ? ` (${happening.length} đang diễn ra)` : ""}${upcoming.length > 0 ? `. Bao gồm: ${upcoming.slice(0, 2).map(e => e.title).join(", ")}` : ""}. Xem danh sách đầy đủ trên trang này.`
              : "Hiện chưa có sự kiện tối nay. Hãy kiểm tra lại sau hoặc xem các sự kiện cuối tuần.",
          },
          {
            question: "Nightlife Đà Lạt có gì đặc biệt?",
            answer: "Đà Lạt có nightlife độc đáo với nhiều quán bar, cà phê acoustic và rooftop có view đẹp. Không khí se lạnh về đêm tạo nên trải nghiệm khác biệt so với các thành phố khác.",
          },
        ]
      : [
          {
            question: "What's happening in Da Lat tonight?",
            answer: totalEvents > 0
              ? `There are ${totalEvents} events tonight in Da Lat${happening.length > 0 ? ` (${happening.length} happening now)` : ""}${upcoming.length > 0 ? `. Including: ${upcoming.slice(0, 2).map(e => e.title).join(", ")}` : ""}. See the full list on this page.`
              : "No events are listed for tonight. Check back later or browse weekend events.",
          },
          {
            question: "What makes Da Lat's nightlife special?",
            answer: "Da Lat has unique nightlife with many bars, acoustic cafes, and rooftops with beautiful views. The cool evening air creates a different experience compared to other Vietnamese cities.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, eventListSchema, faqSchema]} />

      {/* Date display */}
      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            <strong>{totalEvents}</strong> sự kiện tối nay ({todayStr})
          </>
        ) : (
          <>
            <strong>{totalEvents}</strong> events tonight ({todayStr})
          </>
        )}
      </p>

      {totalEvents === 0 ? (
        <div className="text-center py-16">
          <Moon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            {locale === "vi" ? "Chưa có sự kiện tối nay" : "No events tonight"}
          </p>
          <p className="text-sm text-muted-foreground/70 mb-4">
            {locale === "vi"
              ? "Xem các sự kiện cuối tuần hoặc khám phá các địa điểm"
              : "Check out weekend events or explore venues"}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/this-weekend"
              className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {locale === "vi" ? "Cuối Tuần Này" : "This Weekend"}
            </Link>
            <Link
              href="/bars"
              className="text-sm px-4 py-2 rounded-lg border hover:bg-muted"
            >
              {locale === "vi" ? "Quán Bar" : "Bars"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Happening Now */}
          {happening.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {locale === "vi" ? "Đang Diễn Ra" : "Happening Now"}
              </h2>
              <div className="space-y-4">
                {happening.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Later Tonight */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {locale === "vi" ? "Tối Nay" : "Later Tonight"}
              </h2>
              <div className="space-y-4">
                {upcoming.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Cross-links */}
      <nav className="mt-12 pt-8 border-t" aria-label="Explore more">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {locale === "vi" ? "Khám phá thêm" : "Explore More"}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/this-weekend" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Cuối Tuần" : "This Weekend"}
          </Link>
          <Link href="/bars" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Bar" : "Bars"}
          </Link>
          <Link href="/cafes" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Quán Cà Phê" : "Cafes"}
          </Link>
          <Link href="/calendar" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Lịch" : "Calendar"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function TonightPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Đà Lạt Tối Nay" : "Da Lat Tonight"}
        </h1>

        <Suspense fallback={<EventsLoading />}>
          <TonightContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
