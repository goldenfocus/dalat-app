import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, Calendar, MapPin, BadgeCheck, ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import type { Organizer, Event, Locale } from "@/lib/types";
import { generateOrganizerMetadata } from "@/lib/metadata";
import { JsonLd, generateOrganizationSchema, generateBreadcrumbSchema } from "@/lib/structured-data";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getOrganizer(slug: string): Promise<Organizer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getOrganizerEvents(organizerId: string): Promise<Event[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .eq("status", "published")
    .order("starts_at", { ascending: true });
  return data ?? [];
}

// Generate SEO metadata for organizer pages
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const organizer = await getOrganizer(slug);

  if (!organizer) {
    return { title: "Organizer not found" };
  }

  const events = await getOrganizerEvents(organizer.id);
  return generateOrganizerMetadata(organizer, locale as Locale, events.length);
}

export default async function OrganizerPage({ params }: PageProps) {
  const { slug } = await params;
  const locale = await getLocale();
  const [t, tCommon] = await Promise.all([
    getTranslations("organizer"),
    getTranslations("common"),
  ]);
  const organizer = await getOrganizer(slug);

  if (!organizer) {
    notFound();
  }

  const events = await getOrganizerEvents(organizer.id);

  // Split into upcoming and past
  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.starts_at) >= now);
  const pastEvents = events.filter((e) => new Date(e.starts_at) < now).reverse();

  // Generate structured data for SEO and AEO
  const organizationSchema = generateOrganizationSchema(organizer, locale, events.length);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Organizers", url: "/" },
      { name: organizer.name, url: `/organizers/${organizer.slug}` },
    ],
    locale
  );

  return (
    <main className="min-h-screen">
      {/* JSON-LD Structured Data for SEO/AEO */}
      <JsonLd data={[organizationSchema, breadcrumbSchema]} />
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Organizer header */}
        <div className="flex items-start gap-6 mb-8">
          {organizer.logo_url ? (
            <img
              src={organizer.logo_url}
              alt={organizer.name}
              className="w-24 h-24 rounded-xl object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-3xl font-bold text-primary">
                {organizer.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              {organizer.name}
              {organizer.is_verified && (
                <BadgeCheck className="w-6 h-6 text-primary" />
              )}
            </h1>
            {organizer.description && (
              <p className="text-muted-foreground mt-2">{organizer.description}</p>
            )}
            {/* Links */}
            <div className="flex gap-4 mt-3">
              {organizer.website_url && (
                <a
                  href={organizer.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  {t("website")}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {organizer.facebook_url && (
                <a
                  href={organizer.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Facebook
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {organizer.instagram_url && (
                <a
                  href={organizer.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  Instagram
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">{t("upcomingEvents")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {upcomingEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.slug}`}>
                  <Card className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      {event.image_url && (
                        <img
                          src={event.image_url}
                          alt=""
                          className="w-full aspect-[2/1] object-cover rounded-lg mb-3"
                        />
                      )}
                      <h3 className="font-semibold mb-2">{event.title}</h3>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatInDaLat(event.starts_at, "EEE, MMM d 'at' h:mm a", locale as Locale)}
                        </span>
                        {event.location_name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            {event.location_name}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Past events */}
        {pastEvents.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4 text-muted-foreground">
              {t("pastEvents")}
            </h2>
            <div className="space-y-2">
              {pastEvents.map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.slug}`}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  {event.image_url && (
                    <img
                      src={event.image_url}
                      alt=""
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div>
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatInDaLat(event.starts_at, "MMM d, yyyy", locale as Locale)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t("noEventsYet")}</p>
          </div>
        )}
      </div>
    </main>
  );
}
