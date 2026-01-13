import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { Profile, Event, ContentLocale, Locale } from "@/lib/types";
import { generateProfileMetadata } from "@/lib/metadata";
import { JsonLd, generatePersonSchema, generateBreadcrumbSchema } from "@/lib/structured-data";

interface PageProps {
  params: Promise<{ username: string; locale: string }>;
}

async function getProfile(username: string): Promise<Profile | null> {
  const supabase = await createClient();

  // First try to find by username
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  // If not found, try by user ID (for profiles without username)
  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", username)
      .single();
    profile = data;
  }

  return profile as Profile | null;
}

async function getUserEvents(userId: string): Promise<Event[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "published")
    .order("starts_at", { ascending: false })
    .limit(10);

  return (data ?? []) as Event[];
}

async function isCurrentUser(profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id === profileId;
}

interface BioTranslations {
  bio: string | null;
  originalBio: string | null;
  isTranslated: boolean;
  sourceLocale: ContentLocale | null;
}

async function getBioTranslations(
  profileId: string,
  originalBio: string | null,
  sourceLocale: string | null,
  locale: string
): Promise<BioTranslations> {
  if (!originalBio || !isValidContentLocale(locale)) {
    return {
      bio: originalBio,
      originalBio,
      isTranslated: false,
      sourceLocale: null,
    };
  }

  const translations = await getTranslationsWithFallback(
    'profile',
    profileId,
    locale as ContentLocale,
    {
      title: null,
      description: null,
      text_content: null,
      bio: originalBio,
    }
  );

  const translatedBio = translations.bio || originalBio;
  const validSourceLocale = sourceLocale && isValidContentLocale(sourceLocale)
    ? sourceLocale as ContentLocale
    : null;

  return {
    bio: translatedBio,
    originalBio,
    isTranslated: translatedBio !== originalBio,
    sourceLocale: validSourceLocale,
  };
}

// Generate SEO metadata for profile pages
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: rawUsername, locale } = await params;
  const decoded = decodeURIComponent(rawUsername);
  const username = decoded.startsWith("@") ? decoded.slice(1) : decoded;

  const profile = await getProfile(username);
  if (!profile) {
    return { title: "Profile not found" };
  }

  // Get event count for description
  const events = await getUserEvents(profile.id);

  return generateProfileMetadata(profile, locale as Locale, events.length);
}

export default async function ProfilePage({ params }: PageProps) {
  const { username: rawUsername } = await params;
  // Strip @ prefix if present (supports both /@username and /username)
  // URL decode first in case @ is encoded as %40
  const decoded = decodeURIComponent(rawUsername);
  const username = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const profile = await getProfile(username);

  if (!profile) {
    notFound();
  }

  const locale = await getLocale();
  const [t, tCommon] = await Promise.all([
    getTranslations("profile"),
    getTranslations("common"),
  ]);

  const [events, isOwner, bioTranslations] = await Promise.all([
    getUserEvents(profile.id),
    isCurrentUser(profile.id),
    getBioTranslations(profile.id, profile.bio, profile.bio_source_locale, locale),
  ]);

  const upcomingEvents = events.filter(
    (e) => new Date(e.starts_at) > new Date()
  );
  const pastEvents = events.filter((e) => new Date(e.starts_at) <= new Date());

  // Generate structured data for SEO and AEO
  // Use username if available, otherwise fall back to user ID for URLs
  const profileIdentifier = profile.username || profile.id;
  const personSchema = generatePersonSchema(profile, locale, events.length);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: profile.display_name || profile.username || "Profile", url: `/${profileIdentifier}` },
    ],
    locale
  );

  return (
    <main className="min-h-screen">
      {/* JSON-LD Structured Data for SEO/AEO */}
      <JsonLd data={[personSchema, breadcrumbSchema]} />
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
        {/* Profile header */}
        <div className="flex items-start gap-6 mb-8">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-24 h-24 rounded-full"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/20" />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.display_name || profile.username || tCommon("anonymous")}
            </h1>
            {profile.username && (
              <p className="text-muted-foreground">@{profile.username}</p>
            )}
            {bioTranslations.bio && (
              <div className="mt-2 space-y-1">
                <p>{bioTranslations.bio}</p>
                {bioTranslations.isTranslated && bioTranslations.sourceLocale && (
                  <TranslatedFrom
                    sourceLocale={bioTranslations.sourceLocale}
                    originalText={bioTranslations.bio !== bioTranslations.originalBio ? bioTranslations.originalBio ?? undefined : undefined}
                  />
                )}
              </div>
            )}
            {isOwner && (
              <Link
                href="/settings/profile"
                className="text-sm text-primary hover:underline mt-2 inline-block"
              >
                {t("editProfile")}
              </Link>
            )}
          </div>
        </div>

        {/* Events */}
        <div className="space-y-8">
          {upcomingEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">{t("upcomingEvents")}</h2>
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`}>
                    <Card className="hover:border-foreground/20 transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {format(new Date(event.starts_at), "MMM d")}
                          </span>
                        </div>
                        <span className="font-medium">{event.title}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {pastEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 text-muted-foreground">
                {t("pastEvents")}
              </h2>
              <div className="space-y-3">
                {pastEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`}>
                    <Card className="hover:border-foreground/20 transition-colors opacity-60">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {format(new Date(event.starts_at), "MMM d")}
                          </span>
                        </div>
                        <span className="font-medium">{event.title}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {events.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              {t("noEventsYet")}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
