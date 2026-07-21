import Image from "next/image";
import { Link } from "@/lib/i18n/routing";
import { Calendar, Play } from "lucide-react";
import { format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { Profile, Event, ContentLocale, EventMomentsGroup, FollowStatus } from "@/lib/types";
import { ClaimProfileBanner, GhostProfileBadge } from "@/components/profile/claim-profile-banner";
import { MomentsTimeline } from "@/components/moments/moments-timeline";
import { FollowButton } from "@/components/profile/follow-button";
import { TierBadge } from "@/components/loyalty/tier-badge";
import { ProfileTribes } from "@/components/tribes/profile-tribes";

interface ProfileContentProps {
  profileId: string;
  locale: string;
}

async function getProfile(profileId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .single();
  return data as Profile | null;
}

async function getUserEvents(
  userId: string
): Promise<{ upcoming: Event[]; past: Event[] }> {
  const supabase = await createClient();

  // Upcoming = soonest first, recurring series collapsed to their next
  // occurrence; past = most recent first. Split/collapse happens in SQL —
  // fetching a date-ordered slice here and splitting client-side hid
  // near-term events behind far-future series instances.
  const { data, error } = await supabase.rpc("get_profile_events", {
    p_profile_id: userId,
  });
  if (error) {
    console.error("get_profile_events failed:", error);
    return { upcoming: [], past: [] };
  }

  const result = data as { upcoming: Event[] | null; past: Event[] | null } | null;
  return { upcoming: result?.upcoming ?? [], past: result?.past ?? [] };
}

async function isCurrentUser(profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id === profileId;
}

async function isUserLoggedIn(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function getFollowStatus(profileId: string): Promise<{ status: FollowStatus | null; currentUserId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id === profileId) return { status: null, currentUserId: user?.id ?? null };

  const { data, error } = await supabase.rpc("get_follow_status", {
    p_user_id: profileId,
  });
  if (error) return { status: null, currentUserId: user.id };
  return { status: data as unknown as FollowStatus, currentUserId: user.id };
}

async function getUserLoyaltyTier(userId: string): Promise<{ tier: string; points: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_loyalty_status")
    .select("current_tier, total_points")
    .eq("user_id", userId)
    .single();
  if (!data) return null;
  return { tier: data.current_tier, points: data.total_points };
}

const INITIAL_EVENTS = 5;
const MOMENTS_PER_EVENT = 6;

async function getUserMoments(userId: string): Promise<{
  groups: EventMomentsGroup[];
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_user_moments_grouped", {
    p_user_id: userId,
    p_event_limit: INITIAL_EVENTS,
    p_moments_per_event: MOMENTS_PER_EVENT,
    p_event_offset: 0,
    p_content_types: ["photo", "video", "text"],
  });

  if (error) {
    console.error("Failed to fetch user moments:", error);
    return { groups: [], hasMore: false };
  }

  const groups = (data ?? []) as EventMomentsGroup[];
  return {
    groups,
    hasMore: groups.length >= INITIAL_EVENTS,
  };
}

interface EventMomentThumb {
  id: string;
  content_type: "photo" | "video";
  media_url: string | null;
  thumbnail_url: string | null;
}

const MOMENTS_PER_PAST_EVENT = 4;

/**
 * Top moments for a batch of events, keyed by event id.
 *
 * One RPC call for every event on the page rather than one per card — the
 * profile renders up to 5 past events and an N+1 here would be 5 extra
 * round-trips on a server-rendered page.
 */
async function getEventMomentThumbs(
  eventIds: string[]
): Promise<Record<string, EventMomentThumb[]>> {
  if (eventIds.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_events_top_moments", {
    p_event_ids: eventIds,
    p_per_event: MOMENTS_PER_PAST_EVENT,
  });

  if (error) {
    console.error("get_events_top_moments failed:", error);
    return {};
  }

  const byEvent: Record<string, EventMomentThumb[]> = {};
  for (const row of (data ?? []) as { event_id: string; moments: EventMomentThumb[] }[]) {
    byEvent[row.event_id] = row.moments ?? [];
  }
  return byEvent;
}

function isGhostProfile(profile: { is_ghost?: boolean; bio: string | null }): boolean {
  if (profile.is_ghost) return true;
  if (!profile.bio) return false;
  return (
    profile.bio.includes("auto-created from Facebook Events") ||
    profile.bio.includes("auto-created from Facebook") ||
    profile.bio.includes("Contact us to claim it") ||
    profile.bio.includes("Want to claim an event?")
  );
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
      story_content: null,
      technical_content: null,
      meta_description: null,
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

export async function ProfileContent({ profileId, locale }: ProfileContentProps) {
  const profile = await getProfile(profileId);

  if (!profile) {
    return null;
  }

  const [t, tCommon] = await Promise.all([
    getTranslations("profile"),
    getTranslations("common"),
  ]);

  const [events, isOwner, isLoggedIn, bioTranslations, momentsData, followData, loyaltyData] = await Promise.all([
    getUserEvents(profile.id),
    isCurrentUser(profile.id),
    isUserLoggedIn(),
    getBioTranslations(profile.id, profile.bio, profile.bio_source_locale, locale),
    getUserMoments(profile.id),
    getFollowStatus(profile.id),
    getUserLoyaltyTier(profile.id),
  ]);

  const isGhost = isGhostProfile(profile);
  const showClaimBanner = isGhost && isLoggedIn && !isOwner;

  const { upcoming: upcomingEvents, past: pastEvents } = events;
  const totalEventCount = upcomingEvents.length + pastEvents.length;

  // Depends on the event ids, so it can't join the Promise.all above.
  const momentThumbs = await getEventMomentThumbs(pastEvents.map((e) => e.id));

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      {/* Claim profile banner for ghost profiles */}
      {showClaimBanner && (
        <ClaimProfileBanner
          ghostProfileId={profile.id}
          ghostDisplayName={profile.display_name || profile.username || t("anonymous")}
          eventCount={totalEventCount}
        />
      )}

      {/* Profile header */}
      <div className="flex items-start gap-6 mb-8">
        <UserAvatar
          src={profile.avatar_url}
          alt={profile.display_name || profile.username || ""}
          size="xl"
          expandable
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">
              {profile.display_name || profile.username || tCommon("anonymous")}
            </h1>
            {isGhost && <GhostProfileBadge />}
            {loyaltyData && <TierBadge tier={loyaltyData.tier} size="sm" />}
          </div>
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
          {/* Follower/Following Counts */}
          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{profile.follower_count ?? 0}</span>{" "}
              {t("followers")}
            </span>
            <span>
              <span className="font-semibold text-foreground">{profile.following_count ?? 0}</span>{" "}
              {t("followingCount")}
            </span>
          </div>
          {isOwner ? (
            <Link
              href="/settings/profile"
              className="text-sm text-primary hover:underline mt-2 inline-block"
            >
              {t("editProfile")}
            </Link>
          ) : (
            isLoggedIn && followData.status && (
              <div className="mt-3">
                <FollowButton
                  targetUserId={profile.id}
                  initialIsFollowing={followData.status.is_following}
                  initialFollowerCount={profile.follower_count ?? 0}
                />
              </div>
            )
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
              {pastEvents.map((event) => {
                const thumbs = momentThumbs[event.id] ?? [];
                return (
                  <Link key={event.id} href={`/events/${event.slug}`} className="block">
                    {/* Past events used to be a bare date + title row. A cover
                        plus a few moments from the night makes the profile read
                        as a record of what someone actually showed up to. */}
                    <Card className="hover:border-foreground/20 transition-colors overflow-hidden">
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                          {event.image_url ? (
                            <Image
                              src={event.image_url}
                              alt={event.title}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Calendar className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(event.starts_at), "MMM d")}
                          </p>
                          <p className="font-medium truncate">{event.title}</p>
                        </div>

                        {thumbs.length > 0 && (
                          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                            {thumbs.map((moment) => {
                              const src = moment.thumbnail_url || moment.media_url;
                              if (!src) return null;
                              return (
                                <div
                                  key={moment.id}
                                  className="relative w-12 h-12 rounded-md overflow-hidden bg-muted"
                                >
                                  <Image
                                    src={src}
                                    alt=""
                                    fill
                                    sizes="48px"
                                    className="object-cover"
                                  />
                                  {moment.content_type === "video" && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                                      <Play className="w-3.5 h-3.5 text-white fill-white" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {totalEventCount === 0 && (
          <p className="text-muted-foreground text-center py-8">
            {t("noEventsYet")}
          </p>
        )}
      </div>

      {/* Tribes this user belongs to (public/listed only) */}
      <ProfileTribes userId={profile.id} />

      {/* User Moments Timeline */}
      {momentsData.groups.length > 0 && (
        <div className="mt-8">
          <MomentsTimeline
            source={{ type: "user", userId: profile.id }}
            initialGroups={momentsData.groups}
            initialHasMore={momentsData.hasMore}
          />
        </div>
      )}
    </div>
  );
}
