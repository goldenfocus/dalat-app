import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { formatInDaLat } from "@/lib/timezone";
import { getPublicMenu } from "@/lib/menu/queries";
import { generateMenuSchema, venueMenuPath } from "@/lib/menu/schema";
import { venueEditor } from "@/lib/venues/access";
import { MenuSections } from "@/components/menu/menu-sections";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getVenue(slug: string) {
  const db = createStaticClient();
  if (!db) return null;
  const { data } = await db
    .from("venues")
    .select("id,slug,name,logo_url,cover_photo_url,preorder_enabled")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const venue = await getVenue(slug);
  if (!venue) return { title: "Not found" };
  const [t, sections] = await Promise.all([getTranslations({ locale, namespace: "venueMenu" }), getPublicMenu(venue.id, locale)]);
  const highlights = sections
    .flatMap((s) => s.items)
    .filter((i) => i.tags.includes("favourite"))
    .slice(0, 4)
    .map((i) => i.name)
    .join(", ");
  return generateLocalizedMetadata({
    locale: locale as Locale,
    path: venueMenuPath(venue.slug),
    title: t("metaTitle", { venue: venue.name }),
    description: t("metaDescription", { venue: venue.name, highlights }),
    image: venue.cover_photo_url || venue.logo_url || undefined,
    noTitleSuffix: false,
  });
}

export default async function VenueMenuPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const venue = await getVenue(slug);
  if (!venue) notFound();

  const t = await getTranslations("venueMenu");
  const sections = await getPublicMenu(venue.id, locale);
  if (sections.length === 0) notFound();

  const db = await createClient();
  const [{ data: upcoming }, editor] = await Promise.all([
    venue.preorder_enabled
      ? db
          .from("events")
          .select("slug,title,starts_at")
          .eq("venue_id", venue.id)
          .eq("status", "published")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] as { slug: string; title: string; starts_at: string }[] }),
    venueEditor(venue.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <JsonLd
        data={[
          generateMenuSchema(venue, sections, locale),
          generateBreadcrumbSchema(
            [
              { name: "Home", url: "/" },
              { name: venue.name, url: `/${venue.slug}` },
              { name: t("menuTitle"), url: venueMenuPath(venue.slug) },
            ],
            locale,
          ),
        ]}
      />

      <Link
        href={`/${venue.slug}`}
        className="-ml-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground active:scale-95 active:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>{t("backToVenue", { venue: venue.name })}</span>
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-bold">{t("pageHeading", { venue: venue.name })}</h1>
        {editor && (
          <Button asChild variant="outline" size="sm" className="mt-3 min-h-11">
            <Link href={`/venues/${venue.slug}/edit/menu`}>{t("manageMenu")}</Link>
          </Button>
        )}
      </header>

      {upcoming && upcoming.length > 0 && (
        <aside className="mb-8 rounded-xl border bg-muted/40 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarDays className="h-4 w-4" />
            {t("upcomingEventsHeading")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("preorderBanner")}</p>
          <ul className="mt-3 space-y-1">
            {upcoming.map((e) => (
              <li key={e.slug}>
                <Link href={`/events/${e.slug}`} className="flex min-h-11 items-center justify-between gap-3 text-sm underline-offset-2 hover:underline">
                  <span className="truncate">{e.title}</span>
                  <span className="shrink-0 text-muted-foreground">{formatInDaLat(e.starts_at, "MMM d", locale as Locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <MenuSections sections={sections} locale={locale} />
    </main>
  );
}
