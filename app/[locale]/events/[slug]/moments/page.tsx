import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { InfiniteMomentGrid } from "@/components/moments";
import type { Event, MomentWithProfile, EventSettings } from "@/lib/types";

const INITIAL_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ slug: string }>;
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
    title: `Moments - ${event.title} | dalat.app`,
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

async function getMoments(eventId: string): Promise<{ moments: MomentWithProfile[]; hasMore: boolean }> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_event_moments", {
    p_event_id: eventId,
    p_limit: INITIAL_PAGE_SIZE,
    p_offset: 0,
  });

  const moments = (data ?? []) as MomentWithProfile[];
  // If we got exactly PAGE_SIZE, there might be more
  const hasMore = moments.length === INITIAL_PAGE_SIZE;

  return { moments, hasMore };
}

async function canUserPost(eventId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  // Check via RPC or settings
  const settings = await getEventSettings(eventId);

  // If no settings, check if user is event creator
  if (!settings) {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    return event?.created_by === user.id;
  }

  if (!settings.moments_enabled) return false;

  // Check based on who_can_post
  switch (settings.moments_who_can_post) {
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

export default async function EventMomentsPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  const t = await getTranslations("moments");
  const tCommon = await getTranslations("common");

  const [{ moments, hasMore }, canPost] = await Promise.all([
    getMoments(event.id),
    canUserPost(event.id),
  ]);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <Link
            href={`/events/${slug}`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>

          {canPost && (
            <Link href={`/events/${slug}/moments/new`}>
              <Button size="sm" className="active:scale-95 transition-transform">
                <Plus className="w-4 h-4 mr-1" />
                {t("shareYourMoment")}
              </Button>
            </Link>
          )}
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("moments")}</h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>

        {/* Infinite scroll moments grid */}
        <InfiniteMomentGrid
          eventId={event.id}
          initialMoments={moments}
          initialHasMore={hasMore}
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
