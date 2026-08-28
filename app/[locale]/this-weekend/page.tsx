import { Suspense } from "react";
import { Calendar } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { Link } from "@/lib/i18n/routing";
import type { Event, Locale } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import {
  JsonLd,
  generateBreadcrumbSchema,
  generateFAQSchema,
} from "@/lib/structured-data";
import { buildLocales } from "@/lib/i18n/routing";
import { DALAT_TIMEZONE } from "@/lib/timezone";
import {
  getDaLatIsoWeekday,
  getWeekendBounds,
  isEventCurrentOrFuture,
} from "@/lib/events/discovery-windows";
import { takeDistinctEventChoices } from "@/lib/events/distinct-choices";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

// SEO-optimized for "dalat this weekend" searches
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "thisWeekend" });

  const { start } = getWeekendBounds();
  const weekendDate = start.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    timeZone: DALAT_TIMEZONE,
  });

  return generateLocalizedMetadata({
    locale,
    path: "/this-weekend",
    title: t("metaTitle", { date: weekendDate }),
    description: t("metaDescription"),
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

async function getWeekendEvents(): Promise<{
  events: Event[];
  nextUp: Event[];
  unavailable: boolean;
}> {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = getWeekendBounds(now);

  // Fetch events happening during the weekend
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gte("starts_at", start.toISOString())
    .lte("starts_at", end.toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching weekend events:", error);
    return { events: [], nextUp: [], unavailable: true };
  }

  const { data: nextUpData } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true })
    .limit(24);

  const visibleEvents = ((data || []) as Event[]).filter((event) =>
    isEventCurrentOrFuture(event, now),
  );

  return {
    events: visibleEvents,
    nextUp: takeDistinctEventChoices((nextUpData || []) as Event[], 3),
    unavailable: false,
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

async function WeekendContent({ locale }: { locale: Locale }) {
  const { events, nextUp, unavailable } = await getWeekendEvents();
  const t = await getTranslations({ locale, namespace: "thisWeekend" });
  const home = await getTranslations({ locale, namespace: "home" });
  const footer = await getTranslations({ locale, namespace: "nav.footer" });
  const { start, end } = getWeekendBounds();

  const longDate: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DALAT_TIMEZONE,
  };
  const dayHeading: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: DALAT_TIMEZONE,
  };
  const saturdayStr = start.toLocaleDateString(locale, longDate);
  const sundayStr = end.toLocaleDateString(locale, longDate);

  // Group events by day
  const fridayEvents = events.filter(
    (event) => getDaLatIsoWeekday(new Date(event.starts_at)) === 5,
  );
  const saturdayEvents = events.filter(
    (event) => getDaLatIsoWeekday(new Date(event.starts_at)) === 6,
  );
  const sundayEvents = events.filter(
    (event) => getDaLatIsoWeekday(new Date(event.starts_at)) === 7,
  );

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "This Weekend", url: "/this-weekend" },
    ],
    locale,
  );

  const eventListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name:
      locale === "vi" ? "Sự Kiện Cuối Tuần Đà Lạt" : "Da Lat Weekend Events",
    description:
      locale === "vi"
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
            answer:
              events.length > 0
                ? `Có ${events.length} sự kiện diễn ra cuối tuần này tại Đà Lạt${
                    saturdayEvents.length > 0
                      ? `, bao gồm ${saturdayEvents
                          .slice(0, 2)
                          .map((e) => e.title)
                          .join(", ")}`
                      : ""
                  }. Xem danh sách đầy đủ trên trang này.`
                : "Hiện chưa có sự kiện nào được đăng cho cuối tuần này. Hãy kiểm tra lại sau hoặc xem các sự kiện sắp tới.",
          },
          {
            question: "Làm gì ở Đà Lạt vào cuối tuần?",
            answer:
              "Đà Lạt có nhiều hoạt động cuối tuần như: nhạc sống tại các quán cà phê và bar, chợ phiên, triển lãm nghệ thuật, hiking và tham quan các điểm thiên nhiên. Xem lịch sự kiện cập nhật hàng ngày trên ĐàLạt.app.",
          },
        ]
      : [
          {
            question: "What's happening in Da Lat this weekend?",
            answer:
              events.length > 0
                ? `There are ${events.length} events happening this weekend in Da Lat${
                    saturdayEvents.length > 0
                      ? `, including ${saturdayEvents
                          .slice(0, 2)
                          .map((e) => e.title)
                          .join(", ")}`
                      : ""
                  }. See the full list on this page.`
                : "No events are currently listed for this weekend. Check back later or browse upcoming events.",
          },
          {
            question: "What to do in Da Lat on weekends?",
            answer:
              "Da Lat offers many weekend activities: live music at cafes and bars, weekend markets, art exhibitions, hiking, and exploring natural attractions. Check the daily updated event calendar on ĐàLạt.app.",
          },
        ],
  );

  if (unavailable) {
    return (
      <>
        <JsonLd data={breadcrumbSchema} />
        <div className="py-16 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="mb-1 text-lg font-medium text-muted-foreground">
            {t("unavailableTitle")}
          </p>
          <p className="mb-6 text-sm text-muted-foreground/70">
            {t("unavailableDescription")}
          </p>
          <Link
            href="/discover"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
          >
            {footer("discover")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <JsonLd data={[breadcrumbSchema, eventListSchema, faqSchema]} />

      {/* Date range display */}
      <p className="text-muted-foreground mb-6">
        {t.rich("eventsCount", {
          count: events.length,
          from: saturdayStr,
          to: sundayStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {events.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-1">
            {t("emptyTitle")}
          </p>
          <p className="text-sm text-muted-foreground/70 mb-4">
            {t("emptyDescription")}
          </p>
          {nextUp.length > 0 && (
            <section className="mx-auto mt-8 max-w-2xl text-left">
              <h2 className="mb-4 text-lg font-semibold">
                {home("comingUp.title")}
              </h2>
              <div className="space-y-4">
                {nextUp.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {nextUp.length > 0 && (
              <Link
                href="/events/upcoming"
                className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm hover:bg-muted active:scale-[0.98]"
              >
                {t("ctaUpcomingEvents")}
              </Link>
            )}
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
            >
              {footer("discover")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Friday Events — the weekend starts Friday in Da Lat */}
          {fridayEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {new Date(fridayEvents[0].starts_at).toLocaleDateString(
                  locale,
                  dayHeading,
                )}
              </h2>
              <div className="space-y-4">
                {fridayEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {/* Saturday Events */}
          {saturdayEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">
                {new Date(saturdayEvents[0].starts_at).toLocaleDateString(
                  locale,
                  dayHeading,
                )}
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
                {new Date(sundayEvents[0].starts_at).toLocaleDateString(
                  locale,
                  dayHeading,
                )}
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
      <nav className="mt-12 pt-8 border-t" aria-label={t("exploreMore")}>
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {t("exploreMore")}
        </h3>
        <div className="flex flex-wrap gap-2">
          {(events.length > 0 || nextUp.length > 0) && (
            <Link
              href="/events/upcoming"
              className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              {t("chipUpcoming")}
            </Link>
          )}
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t("chipCalendar")}
          </Link>
          <Link
            href="/festivals"
            className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t("chipFestivals")}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function ThisWeekendPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "thisWeekend" });

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>

        <Suspense fallback={<EventsLoading />}>
          <WeekendContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
