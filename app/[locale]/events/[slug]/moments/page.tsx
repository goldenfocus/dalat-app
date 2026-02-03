import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { MomentsViewContainer } from "@/components/moments/moments-view-container";
import type { Event, MomentWithProfile, EventSettings } from "@/lib/types";

const INITIAL_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("title")
    .eq("slug", slug)
    .single();

  if (!event) {
    return { title: "Moments" };
  }

  return {
    title: `Moments - ${event.title} | ĐàLạt.app`,
    description: `Photos and videos from ${event.title}`,
  };
}

async function getEvent(slug: string): Promise<Event | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .single();

  return data as Event | null;
}

async function getEventSettings(eventId: string): Promise<EventSettings | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("event_settings")
    .select("*")
    .eq("event_id", eventId)
    .single();

  return data as EventSettings | null;
}

async function getMoments(eventId: string): Promise<{ moments: MomentWithProfile[]; hasMore: boolean; totalCount: number }> {
  const supabase = await createClient();

  // Fetch moments and total count in parallel
  const [momentsResult, countResult] = await Promise.all([
    supabase.rpc("get_event_moments", {
      p_event_id: eventId,
      p_limit: INITIAL_PAGE_SIZE,
      p_offset: 0,
    }),
    supabase
      .from("moments")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "published"),
  ]);

  const moments = (momentsResult.data ?? []) as MomentWithProfile[];
  const totalCount = countResult.count ?? moments.length;
  // If we got exactly PAGE_SIZE, there might be more
  const hasMore = moments.length === INITIAL_PAGE_SIZE;

  return { moments, hasMore, totalCount };
}

async function canUserPost(eventId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  // Check via RPC or settings
  const settings = await getEventSettings(eventId);

  // If settings exist and moments_enabled is explicitly false, only creator can post
  if (settings && !settings.moments_enabled) {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    return event?.created_by === user.id;
  }

  // Default to 'anyone' if no settings exist (moments enabled by default)
  const whoCanPost = settings?.moments_who_can_post ?? "anyone";

  // Check based on who_can_post
  switch (whoCanPost) {
    case "anyone":
      return true;
    case "rsvp":
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();
      return rsvp?.status && ["going", "waitlist", "interested"].includes(rsvp.status);
    case "confirmed":
      const { data: confirmedRsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();
      return confirmedRsvp?.status === "going";
    default:
      return false;
  }
}

export default async function EventMomentsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { view } = await searchParams;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  const t = await getTranslations("moments");

  const [{ moments, hasMore, totalCount }, canPost] = await Promise.all([
    getMoments(event.id),
    canUserPost(event.id),
  ]);

  return (
    <main className="min-h-screen">
      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("moments")}</h1>
          <Link
            href={`/events/${slug}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {event.title}
          </Link>
        </div>

        {/* Moments view with grid/immersive toggle */}
        <MomentsViewContainer
          eventId={event.id}
          eventSlug={event.slug}
          initialMoments={moments}
          initialHasMore={hasMore}
          totalCount={totalCount}
          initialView={view === "immersive" ? "immersive" : undefined}
        />

        {/* CTA for users who can post but haven't yet */}
        {moments.length === 0 && canPost && (
          <div className="mt-6 text-center">
            <Link href={`/events/${slug}/moments/new`}>
              <Button size="lg" className="active:scale-95 transition-transform">
                <Plus className="w-5 h-5 mr-2" />
                {t("shareYourMoment")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
