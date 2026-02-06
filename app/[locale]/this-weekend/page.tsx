import { Suspense } from "react";
import { Calendar } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { Link } from "@/lib/i18n/routing";
import type { Event, Locale } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateFAQSchema } from "@/lib/structured-data";
import { locales } from "@/lib/i18n/routing";
import { formatInDaLat, DALAT_TIMEZONE } from "@/lib/timezone";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { nextSaturday, nextSunday, isSaturday, isSunday, isAfter, startOfDay, endOfDay } from "date-fns";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// SEO-optimized for "dalat this weekend" searches
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;

  // Get weekend date range for dynamic title
  const now = toZonedTime(new Date(), DALAT_TIMEZONE);
  const saturday = isSaturday(now) ? now : isSunday(now) ? now : nextSaturday(now);
  const weekendDate = formatInTimeZone(saturday, DALAT_TIMEZONE, "MMM d");

  const title = locale === "vi"
    ? `Đà Lạt Cuối Tuần Này (${weekendDate}) - Sự Kiện & Hoạt Động`
    : `Da Lat This Weekend (${weekendDate}) - Events & Things to Do`;

  const description = locale === "vi"
    ? `Khám phá các sự kiện cuối tuần ở Đà Lạt: nhạc sống, lễ hội, triển lãm và hoạt động ngoài trời. Cập nhật theo thời gian thực.`
    : `Discover weekend events in Da Lat: live music, festivals, exhibitions, and outdoor activities. Updated in real-time.`;

  return generateLocalizedMetadata({
    locale,
    path: "/this-weekend",
    title,
    description,
    keywords: [
      "Da Lat this weekend",
      "what to do in Dalat this weekend",
      "Dalat weekend events",
      "weekend activities Da Lat",
      "Đà Lạt cuối tuần",
      "sự kiện cuối tuần Đà Lạt",
    ],
  });
}

// Get weekend date boundaries in Da Lat timezone
function getWeekendBounds(): { start: Date; end: Date } {
  const now = toZonedTime(new Date(), DALAT_TIMEZONE);

  let saturday: Date;
  let sunday: Date;

  if (isSaturday(now)) {
    saturday = startOfDay(now);
    sunday = nextSunday(now);
  } else if (isSunday(now)) {
    saturday = startOfDay(now); // Show today's events even on Sunday
    sunday = now;
  } else {
    saturday = nextSaturday(now);
    sunday = nextSunday(saturday);
  }

  return {
    start: startOfDay(saturday),
    end: endOfDay(sunday),
  };
}

async function getWeekendEvents(): Promise<Event[]> {
  const supabase = await createClient();
  const { start, end } = getWeekendBounds();

  // Fetch events happening during the weekend
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching weekend events:", error);
    return [];
  }

  return (data || []) as Event[];
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

async function WeekendContent({ locale }: { locale: Locale }) {
  const events = await getWeekendEvents();
  const { start, end } = getWeekendBounds();

  const saturdayStr = formatInTimeZone(start, DALAT_TIMEZONE, "EEEE, MMMM d");
  const sundayStr = formatInTimeZone(end, DALAT_TIMEZONE, "EEEE, MMMM d");

  // Group events by day
  const saturdayEvents = events.filter((e) => {
    const eventDate = toZonedTime(new Date(e.starts_at), DALAT_TIMEZONE);
    return isSaturday(eventDate);
  });
  const sundayEvents = events.filter((e) => {
    const eventDate = toZonedTime(new Date(e.starts_at), DALAT_TIMEZONE);
    return isSunday(eventDate);
  });

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "This Weekend", url: "/this-weekend" },
    ],
    locale
  );

  const eventListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Sự Kiện Cuối Tuần Đà Lạt" : "Da Lat Weekend Events",
    description: locale === "vi"
      ? `Các sự kiện diễn ra cuối tuần này tại Đà Lạt (${saturdayStr} - ${sundayStr})`
      : `Events happening this weekend in Da Lat (${saturdayStr} - ${sundayStr})`,
    numberOfItems: events.length,
    itemListElement: events.slice(0, 50).map((event, index) => ({
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

  // FAQ schema for AEO - answers "what to do this weekend" queries
  const faqSchema = generateFAQSchema(
    locale === "vi"
      ? [
          {
            question: "Cuối tuần này ở Đà Lạt có gì hay?",
            answer: events.length > 0
              ? `Có ${events.length} sự kiện diễn ra cuối tuần này tại Đà Lạt${saturdayEvents.length > 0 ? `, bao gồm ${saturdayEvents.slice(0, 2).map(e => e.title).join(", ")}` : ""}. Xem danh sách đầy đủ trên trang này.`
              : "Hiện chưa có sự kiện nào được đăng cho cuối tuần này. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Làm gì ở Đà Lạt vào cuối tuần?",
            answer: "Đà Lạt có nhiều hoạt động cuối tuần như: nhạc sống tại các quán cà phê và bar, chợ phiên, triển lãm nghệ thuật, hiking và tham quan các điểm thiên nhiên. Xem lịch sự kiện cập nhật hàng ngày trên ĐàLạt.app.",
          },
        ]
      : [
          {
            question: "What's happening in Da Lat this weekend?",
            answer: events.length > 0
              ? `There are ${events.length} events happening this weekend in Da Lat${saturdayEvents.length > 0 ? `, including ${saturdayEvents.slice(0, 2).map(e => e.title).join(", ")}` : ""}. See the full list on this page.`
              : "No events are currently listed for this weekend. Check back later or browse upcoming events.",
          },
          {
            question: "What to do in Da Lat on weekends?",
            answer: "Da Lat offers many weekend activities: live music at cafes and bars, weekend markets, art exhibitions, hiking, and exploring natural attractions. Check the daily updated event calendar on ĐàLạt.app.",
          },
        ]
  );

  return (
    <>
      <JsonLd data={[breadcrumbSchema, eventListSchema, faqSchema]} />

      {/* Date range display */}
      <p className="text-muted-foreground mb-6">
        {locale === "vi" ? (
          <>
            <strong>{events.length}</strong> sự kiện diễn ra từ {saturdayStr} đến {sundayStr}
          </>
        ) : (
          <>
            <strong>{events.length}</strong> events from {saturdayStr} to {sundayStr}
          </>
        )}
      </p>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            {locale === "vi" ? "Chưa có sự kiện cuối tuần này" : "No events this weekend"}
          </p>
          <p className="text-sm text-muted-foreground/70 mb-4">
            {locale === "vi"
              ? "Xem các sự kiện sắp tới hoặc khám phá các địa điểm"
              : "Check out upcoming events or explore venues"}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/events/upcoming"
              className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {locale === "vi" ? "Sự kiện sắp tới" : "Upcoming Events"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Saturday Events */}
          {saturdayEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {locale === "vi" ? `Thứ Bảy (${formatInTimeZone(start, DALAT_TIMEZONE, "d/M")})` : `Saturday (${formatInTimeZone(start, DALAT_TIMEZONE, "MMM d")})`}
              </h2>
              <div className="space-y-4">
                {saturdayEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Sunday Events */}
          {sundayEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {locale === "vi" ? `Chủ Nhật (${formatInTimeZone(end, DALAT_TIMEZONE, "d/M")})` : `Sunday (${formatInTimeZone(end, DALAT_TIMEZONE, "MMM d")})`}
              </h2>
              <div className="space-y-4">
                {sundayEvents.map((event) => (
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
          <Link href="/tonight" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Tối Nay" : "Tonight"}
          </Link>
          <Link href="/events/upcoming" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Sắp Tới" : "Upcoming"}
          </Link>
          <Link href="/calendar" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Lịch" : "Calendar"}
          </Link>
          <Link href="/festivals" className="text-sm px-3 py-1.5 rounded-full border hover:bg-muted transition-colors">
            {locale === "vi" ? "Lễ Hội" : "Festivals"}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function ThisWeekendPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">
          {locale === "vi" ? "Đà Lạt Cuối Tuần Này" : "Da Lat This Weekend"}
        </h1>

        <Suspense fallback={<EventsLoading />}>
          <WeekendContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
