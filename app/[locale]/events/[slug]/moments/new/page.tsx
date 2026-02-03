import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MomentForm } from "@/components/moments";
import { getEffectiveUser } from "@/lib/god-mode";
import type { Event, EventSettings } from "@/lib/types";

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
    return { title: "Share a Moment" };
  }

  return {
    title: `Share a Moment - ${event.title} | ĐàLạt.app`,
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

async function canUserPost(eventId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  const settings = await getEventSettings(eventId);

  // If settings exist and moments_enabled is explicitly false, only creator can post
  if (settings && !settings.moments_enabled) {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    return event?.created_by === userId;
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
        .eq("user_id", userId)
        .single();
      return rsvp?.status && ["going", "waitlist", "interested"].includes(rsvp.status);
    case "confirmed":
      const { data: confirmedRsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .single();
      return confirmedRsvp?.status === "going";
    default:
      return false;
  }
}

export default async function NewMomentPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  // Use getEffectiveUser to support God Mode impersonation
  const { user, godMode } = await getEffectiveUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect(`/login?redirect=/events/${slug}/moments/new`);
  }

  // Use real admin for permission check
  const canPost = await canUserPost(event.id, user.id);

  // Redirect if user can't post
  if (!canPost) {
    redirect(`/events/${slug}/moments`);
  }

  const t = await getTranslations("moments");

  return (
    <main className="min-h-screen">
      <div className="container max-w-lg mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("shareYourMoment")}</h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>

        {/* Form - unified upload experience for all users */}
        <MomentForm
          eventId={event.id}
          eventSlug={slug}
          userId={user.id}
          godModeUserId={godMode.isActive ? godMode.targetUserId! : undefined}
        />
      </div>
    </main>
  );
}
