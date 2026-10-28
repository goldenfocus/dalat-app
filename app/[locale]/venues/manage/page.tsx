import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Building2, CalendarDays, Pencil } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
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
  const [venues, t, tv, tf, tm, tmenu] = await Promise.all([
    managedVenues(), getTranslations("venueClaim"), getTranslations("venues"),
    getTranslations("eventForm"), getTranslations("userMenu"), getTranslations("venueMenu"),
  ]);
  const { data: events, error } = venues.length ? await db.from("events")
    .select("id,slug,title,venue_id,starts_at").in("venue_id", venues.map(venue => venue.id))
    .eq("status", "published").or("tribe_id.is.null,tribe_visibility.eq.public")
    // Dynamic authenticated page: include today and the previous 48 hours.
    // eslint-disable-next-line react-hooks/purity
    .gte("starts_at", new Date(Date.now() - 48 * 3600_000).toISOString())
    .order("starts_at") : { data: [], error: null };
  if (error) throw error;
  const translations = await translatedRecords("event", (events || []).map(event => event.id), locale);
  return <main className="mx-auto max-w-2xl space-y-8 px-4 py-8 text-foreground">
    <header><Building2 className="mb-3 h-8 w-8 text-primary" aria-hidden="true" />
      <h1 className="text-3xl font-semibold">{tm("myVenues")}</h1></header>
    {!venues.length && <p className="text-muted-foreground">{tv("noVenues")}</p>}
    {venues.map(venue => <section key={venue.id} className="space-y-4 border-t pt-6">
      <h2 className="text-2xl font-semibold"><Link href={`/${venue.slug}`}>{venue.name}</Link></h2>
      <div className="flex flex-wrap gap-3">
        <Link href={`/venues/${venue.slug}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 font-medium hover:bg-muted">
          <Pencil className="h-4 w-4" aria-hidden="true" />{t("editTitle", { name: venue.name })}</Link>
        <Link href={`/venues/${venue.slug}/edit/menu`} className="inline-flex min-h-11 items-center px-4 text-primary underline">{tmenu("manageMenu")}</Link>
      </div>
      <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5" aria-hidden="true" />{tv("upcomingEvents")}</h3>
      {!(events || []).some(event => event.venue_id === venue.id) && <p className="text-sm text-muted-foreground">{tv("noUpcomingEvents")}</p>}
      <div className="divide-y">{(events || []).filter(event => event.venue_id === venue.id).map(event => {
        const title = translations.get(event.id)?.get("title") || event.title;
        return <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div className="min-w-0 flex-1 basis-48"><Link href={`/events/${event.slug}`} className="font-medium">{title}</Link>
            <EventDate startsAt={event.starts_at} locale={locale} />
            {title !== event.title && <OriginalText text={event.title} />}</div>
          <Link href={`/events/${event.slug}/edit`} className="inline-flex min-h-11 items-center gap-2 px-3 text-primary underline">
            <Pencil className="h-4 w-4" aria-hidden="true" />{tf("editEvent")}</Link>
        </div>;
      })}</div>
    </section>)}
  </main>;
}

async function EventDate({ startsAt, locale }: { startsAt: string; locale: Locale }) {
  return <p className="mt-1 text-sm text-muted-foreground">{await formatInDaLatAsync(startsAt, "EEEE, MMMM d · HH:mm", locale)}</p>;
}
