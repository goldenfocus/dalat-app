import { Suspense } from "react";
import { Moon } from "lucide-react";
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
import { getTonightBounds } from "@/lib/events/discovery-windows";
import { takeDistinctEventChoices } from "@/lib/events/distinct-choices";

const SITE_URL = "https://dalat.app";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

// SEO-optimized for "dalat tonight" and "things to do tonight in dalat" searches
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tonight" });

  const todayStr = new Date().toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DALAT_TIMEZONE,
  });

  return generateLocalizedMetadata({
    locale,
    path: "/tonight",
    title: t("metaTitle", { date: todayStr }),
    description: t("metaDescription"),
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
async function getTonightEvents(): Promise<{
  happening: Event[];
  upcoming: Event[];
  nextUp: Event[];
  unavailable: boolean;
}> {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = getTonightBounds(now);
  const upcomingStart = now > start ? now : start;

  // Fetch events happening now (currently running)
  const { data: happeningData, error: happeningError } = await supabase.rpc(
    "get_events_by_lifecycle",
    {
      p_lifecycle: "happening",
      p_limit: 20,
    },
  );

  // Fetch events starting tonight
  const { data: tonightData, error: tonightError } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gte("starts_at", upcomingStart.toISOString())
    .lte("starts_at", end.toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  const { data: nextUpData, error: nextUpError } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true })
    .limit(24);

  const happensDuringTonight = now >= start && now <= end;
  const happening = happensDuringTonight
    ? ((happeningData || []) as Event[])
    : [];
  const happeningIds = new Set(happening.map((event) => event.id));

  if (happeningError || tonightError || nextUpError) {
    console.error("Error loading tonight discovery inventory:", {
      happening: happeningError?.message,
      tonight: tonightError?.message,
      nextUp: nextUpError?.message,
    });
  }

  return {
    happening,
    upcoming: ((tonightData || []) as Event[]).filter(
      (event) => !happeningIds.has(event.id),
    ),
    nextUp: takeDistinctEventChoices((nextUpData || []) as Event[], 3),
    unavailable: Boolean(happeningError || tonightError),
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
  const { happening, upcoming, nextUp, unavailable } = await getTonightEvents();
  const t = await getTranslations({ locale, namespace: "tonight" });
  const home = await getTranslations({ locale, namespace: "home" });
  const footer = await getTranslations({ locale, namespace: "nav.footer" });
  const todayStr = new Date().toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: DALAT_TIMEZONE,
  });

  const totalEvents = happening.length + upcoming.length;

  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Tonight", url: "/tonight" },
    ],
    locale,
  );

  const eventListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: locale === "vi" ? "Sự Kiện Tối Nay Đà Lạt" : "Da Lat Events Tonight",
    description:
      locale === "vi"
        ? `Các sự kiện diễn ra tối nay tại Đà Lạt (${todayStr})`
        : `Events happening tonight in Da Lat (${todayStr})`,
    numberOfItems: totalEvents,
    itemListElement: [...happening, ...upcoming]
      .slice(0, 30)
      .map((event, index) => ({
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
            answer:
              totalEvents > 0
                ? `Có ${totalEvents} sự kiện tối nay tại Đà Lạt${happening.length > 0 ? ` (${happening.length} đang diễn ra)` : ""}${
                    upcoming.length > 0
                      ? `. Bao gồm: ${upcoming
                          .slice(0, 2)
                          .map((e) => e.title)
                          .join(", ")}`
                      : ""
                  }. Xem danh sách đầy đủ trên trang này.`
                : "Hiện chưa có sự kiện tối nay. Hãy kiểm tra lại sau hoặc xem các sự kiện cuối tuần.",
          },
          {
            question: "Nightlife Đà Lạt có gì đặc biệt?",
            answer:
              "Đà Lạt có nightlife độc đáo với nhiều quán bar, cà phê acoustic và rooftop có view đẹp. Không khí se lạnh về đêm tạo nên trải nghiệm khác biệt so với các thành phố khác.",
          },
        ]
      : [
          {
            question: "What's happening in Da Lat tonight?",
            answer:
              totalEvents > 0
                ? `There are ${totalEvents} events tonight in Da Lat${happening.length > 0 ? ` (${happening.length} happening now)` : ""}${
                    upcoming.length > 0
                      ? `. Including: ${upcoming
                          .slice(0, 2)
                          .map((e) => e.title)
                          .join(", ")}`
                      : ""
                  }. See the full list on this page.`
                : "No events are listed for tonight. Check back later or browse weekend events.",
          },
          {
            question: "What makes Da Lat's nightlife special?",
            answer:
              "Da Lat has unique nightlife with many bars, acoustic cafes, and rooftops with beautiful views. The cool evening air creates a different experience compared to other Vietnamese cities.",
          },
        ],
  );

  if (unavailable) {
    return (
      <>
        <JsonLd data={breadcrumbSchema} />
        <div className="py-16 text-center">
          <Moon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
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

      {/* Date display */}
      <p className="text-muted-foreground mb-6">
        {t.rich("eventsCount", {
          count: totalEvents,
          date: todayStr,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      {totalEvents === 0 ? (
        <div className="text-center py-16">
          <Moon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
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
            <Link
              href="/discover"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
            >
              {footer("discover")}
            </Link>
            {nextUp.length > 0 && (
              <Link
                href="/events/upcoming"
                className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm hover:bg-muted active:scale-[0.98]"
              >
                {home("seeAllUpcoming")}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Happening Now */}
          {happening.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                {t("happeningNow")}
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
                {t("laterTonight")}
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
      <nav className="mt-12 pt-8 border-t" aria-label={t("exploreMore")}>
        <h3 className="text-sm font-medium text-muted-foreground mb-4">
          {t("exploreMore")}
        </h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/bars"
            className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t("chipBars")}
          </Link>
          <Link
            href="/cafes"
            className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t("chipCafes")}
          </Link>
          <Link
            href="/calendar"
            className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            {t("chipCalendar")}
          </Link>
        </div>
      </nav>
    </>
  );
}

export default async function TonightPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "tonight" });

  return (
    <main className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>

        <Suspense fallback={<EventsLoading />}>
          <TonightContent locale={locale} />
        </Suspense>
      </div>
    </main>
  );
}
