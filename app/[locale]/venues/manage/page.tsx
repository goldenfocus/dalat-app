import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, Pencil } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { groupVenueEvents } from "@/lib/venues/event-groups";
import { managedVenues } from "@/lib/venues/managed";
import { translatedRecords } from "@/lib/translations/public-content";
import { OriginalText } from "@/components/ui/original-text";
import { formatInDaLatAsync } from "@/lib/timezone";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "userMenu" });
  return { ...generateLocalizedMetadata({ locale, path: "/venues/manage", title: t("myVenues"), description: t("myVenues") }), robots: { index: false, follow: false } };
}

export default async function ManageVenuesPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`${locale === "en" ? "" : `/${locale}`}/venues/manage`)}`);
  const [venues, t, tv, tf, tm, tmenu, ts] = await Promise.all([
    managedVenues(), getTranslations("venueClaim"), getTranslations("venues"),
    getTranslations("eventForm"), getTranslations("userMenu"), getTranslations("venueMenu"), getTranslations("series"),
  ]);
  const { data: events, error } = venues.length ? await db.from("events")
    .select("id,slug,title,venue_id,series_id,starts_at").in("venue_id", venues.map(venue => venue.id))
    .eq("status", "published").or("tribe_id.is.null,tribe_visibility.eq.public")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at") : { data: [], error: null };
  if (error) throw error;
  const groups = groupVenueEvents(events || []);
  const translations = await translatedRecords("event", groups.map(group => group.event.id), locale);
  return <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 text-foreground">
    <header className="flex items-center gap-3"><Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{tm("myVenues")}</h1></header>
    {!venues.length && <p className="text-muted-foreground">{tv("noVenues")}</p>}
    {venues.map(venue => <section key={venue.id} className="space-y-3 border-t pt-4">
      <h2 className="text-xl font-semibold"><Link href={`/${venue.slug}`}>{venue.name}</Link></h2>
      <div className="flex flex-wrap gap-3">
        <Link href={`/venues/${venue.slug}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
          <Pencil className="h-4 w-4" aria-hidden="true" />{t("editVenue")}</Link>
        <Link href={`/venues/${venue.slug}/edit/menu`} className="inline-flex min-h-11 items-center px-4 text-primary underline">{tmenu("manageMenu")}</Link>
      </div>
      <h3 className="pt-3 font-semibold">{tv("upcomingEvents")}</h3>
      {!(events || []).some(event => event.venue_id === venue.id) && <p className="text-sm text-muted-foreground">{tv("noUpcomingEvents")}</p>}
      <div className="divide-y">{groups.filter(group => group.event.venue_id === venue.id).map(({ event, dates }) => {
        const title = translations.get(event.id)?.get("title") || event.title;
        return <div key={event.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 basis-48"><Link href={`/events/${event.slug}`} className="font-medium">{title}</Link>
            <EventDate startsAt={event.starts_at} locale={locale} />
            {title !== event.title && <OriginalText text={event.title} />}</div>
          <Link href={`/events/${event.slug}/edit`} className="inline-flex min-h-11 items-center gap-2 px-3 text-primary underline">
            <Pencil className="h-4 w-4" aria-hidden="true" />{tf("editEvent")}</Link>
          </div>
          {dates.length > 1 && <details className="mt-1 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">{ts("upcomingDates")} ({dates.length})</summary>
            <ul className="border-l pl-4">{dates.map(date => <li key={date.id}>
              <Link href={`/events/${date.slug}/edit`} className="inline-flex min-h-11 items-center text-primary underline">
                <EventDate startsAt={date.starts_at} locale={locale} />
              </Link>
            </li>)}</ul>
          </details>}
        </div>;
      })}</div>
    </section>)}
  </main>;
}

async function EventDate({ startsAt, locale }: { startsAt: string; locale: Locale }) {
  return <p className="mt-1 text-sm text-muted-foreground">{await formatInDaLatAsync(startsAt, "EEEE, MMMM d · HH:mm", locale)}</p>;
}
