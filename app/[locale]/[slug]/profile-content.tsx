import { Link } from "@/lib/i18n/routing";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { UserAvatar } from "@/components/ui/user-avatar";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { TranslatedFrom } from "@/components/ui/translation-badge";
import { getTranslationsWithFallback, isValidContentLocale } from "@/lib/translations";
import type { Profile, Event, ContentLocale, EventMomentsGroup, FollowStatus } from "@/lib/types";
import { ClaimProfileBanner, GhostProfileBadge } from "@/components/profile/claim-profile-banner";
import { UserMomentsTimeline } from "@/components/moments/user-moments-timeline";
import { FollowButton } from "@/components/profile/follow-button";
import { TierBadge } from "@/components/loyalty/tier-badge";

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

async function getUserEvents(userId: string): Promise<Event[]> {
  const supabase = await createClient();

  // Query 1: Events created by this user
  const { data: createdEvents } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "published")
    .order("starts_at", { ascending: false })
    .limit(10);

  // Get organizer IDs that this user owns
  const { data: ownedOrganizers } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", userId);

  const organizerIds = (ownedOrganizers ?? []).map((o) => o.id);

  // Query 2: Events where user owns the organizer (if any)
  let organizedEvents: Event[] = [];
  if (organizerIds.length > 0) {
    const { data } = await supabase
      .from("events")
      .select("*")
      .in("organizer_id", organizerIds)
      .eq("status", "published")
      .order("starts_at", { ascending: false })
      .limit(10);
    organizedEvents = (data ?? []) as Event[];
  }

  // Combine and deduplicate by event ID
  const allEvents = [...(createdEvents ?? []), ...organizedEvents];
  const uniqueEvents = Array.from(
    new Map(allEvents.map((e) => [e.id, e])).values()
  ) as Event[];

  // Sort by starts_at descending and limit
  return uniqueEvents
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 10);
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

  const upcomingEvents = events
    .filter((e) => new Date(e.starts_at) > new Date())
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const pastEvents = events.filter((e) => new Date(e.starts_at) <= new Date());

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      {/* Claim profile banner for ghost profiles */}
      {showClaimBanner && (
        <ClaimProfileBanner
          ghostProfileId={profile.id}
          ghostDisplayName={profile.display_name || profile.username || t("anonymous")}
          eventCount={events.length}
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

      {/* User Moments Timeline */}
      {momentsData.groups.length > 0 && (
        <div className="mt-8">
          <UserMomentsTimeline
            userId={profile.id}
            initialGroups={momentsData.groups}
            initialHasMore={momentsData.hasMore}
          />
        </div>
      )}
    </div>
  );
}
