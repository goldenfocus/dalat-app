import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, Globe, ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatInDaLat } from "@/lib/timezone";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Organizer, Event, Locale, Profile } from "@/lib/types";
import { ClaimOrganizerBanner, UnclaimedOrganizerBadge } from "@/components/organizers/claim-organizer-banner";
import { UserAvatar } from "@/components/ui/user-avatar";
import { VerifiedGlowRing } from "@/components/ui/verified-badge";

interface OrganizerContentProps {
  organizerId: string;
  locale: string;
}

type OrganizerWithOwner = Organizer & {
  owner: Pick<Profile, "id" | "avatar_url" | "display_name" | "username"> | null;
};

async function getOrganizer(organizerId: string): Promise<OrganizerWithOwner | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizers")
    .select("*, owner:profiles!owner_id(id, avatar_url, display_name, username)")
    .eq("id", organizerId)
    .single();
  return data as OrganizerWithOwner | null;
}

async function getOrganizerEvents(organizerId: string, ownerId: string | null): Promise<Event[]> {
  const supabase = await createClient();

  // Query 1: Events where this organizer is assigned
  const { data: organizedEvents } = await supabase
    .from("events")
    .select("*")
    .eq("organizer_id", organizerId)
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  // Query 2: Events created by the owner (if owner exists)
  let createdEvents: Event[] = [];
  if (ownerId) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", ownerId)
      .eq("status", "published")
      .order("starts_at", { ascending: true });
    createdEvents = (data ?? []) as Event[];
  }

  // Combine and deduplicate by event ID
  const allEvents = [...(organizedEvents ?? []), ...createdEvents];
  const uniqueEvents = Array.from(
    new Map(allEvents.map((e) => [e.id, e])).values()
  ) as Event[];

  // Sort by starts_at ascending
  return uniqueEvents.sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
}

async function isUserLoggedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

export async function OrganizerContent({ organizerId, locale }: OrganizerContentProps) {
  const [t, tCommon] = await Promise.all([
    getTranslations("organizer"),
    getTranslations("common"),
  ]);

  const organizer = await getOrganizer(organizerId);

  if (!organizer) {
    return null;
  }

  const [events, isLoggedIn] = await Promise.all([
    getOrganizerEvents(organizer.id, organizer.owner?.id ?? null),
    isUserLoggedIn(),
  ]);

  const isUnclaimed = !organizer.owner_id;
  const showClaimBanner = isUnclaimed && isLoggedIn && !organizer.is_verified;

  const now = new Date();
  const upcomingEvents = events.filter((e) => new Date(e.starts_at) >= now);
  const pastEvents = events.filter((e) => new Date(e.starts_at) < now).reverse();

  return (
    <>
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
        {/* Claim organizer banner for unclaimed organizers */}
        {showClaimBanner && (
          <ClaimOrganizerBanner
            organizerSlug={organizer.slug}
            organizerName={organizer.name}
            eventCount={events.length}
          />
        )}

        {/* Organizer header */}
        <div className="flex items-start gap-6 mb-8">
          {/* Avatar with golden glow ring for verified organizers */}
          <div className="relative flex-shrink-0 overflow-visible pb-4">
            {organizer.is_verified ? (
              // Verified: wrap avatar in golden glow ring
              <VerifiedGlowRing>
                {organizer.logo_url ? (
                  <img
                    src={organizer.logo_url}
                    alt={organizer.name}
                    className="w-24 h-24 rounded-full object-cover"
                  />
                ) : organizer.owner?.avatar_url ? (
                  <img
                    src={organizer.owner.avatar_url}
                    alt={organizer.owner.display_name || organizer.owner.username || organizer.name}
                    className="w-24 h-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-3xl font-bold text-primary">
                      {organizer.name.charAt(0)}
                    </span>
                  </div>
                )}
              </VerifiedGlowRing>
            ) : (
              // Not verified: regular avatar
              organizer.logo_url ? (
                <img
                  src={organizer.logo_url}
                  alt={organizer.name}
                  className="w-24 h-24 rounded-xl object-cover"
                />
              ) : organizer.owner?.avatar_url ? (
                <UserAvatar
                  src={organizer.owner.avatar_url}
                  alt={organizer.owner.display_name || organizer.owner.username || organizer.name}
                  size="xl"
                  expandable
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="text-3xl font-bold text-primary">
                    {organizer.name.charAt(0)}
                  </span>
                </div>
              )
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold flex items-center gap-2 flex-wrap">
              {organizer.name}
              {isUnclaimed && !organizer.is_verified && (
                <UnclaimedOrganizerBadge />
              )}
            </h1>
            {organizer.description && (
              <p className="text-muted-foreground mt-2">{organizer.description}</p>
            )}
            {/* Links */}
            {(organizer.website_url || organizer.facebook_url || organizer.instagram_url) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {organizer.website_url && (
                  <a
                    href={organizer.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
                    aria-label="Website"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {organizer.facebook_url && (
                  <a
                    href={organizer.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
                    aria-label="Facebook"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                )}
                {organizer.instagram_url && (
                  <a
                    href={organizer.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center w-11 h-11 rounded-lg border border-border hover:bg-muted active:scale-95 transition-all"
                    aria-label="Instagram"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                    </svg>
                  </a>
                )}
              </div>
            )}
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
                            {decodeUnicodeEscapes(event.location_name)}
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
    </>
  );
}
