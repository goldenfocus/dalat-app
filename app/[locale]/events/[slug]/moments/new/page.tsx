import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, Camera } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MomentForm } from "@/components/moments";
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
    title: `Share a Moment - ${event.title} | dalat.app`,
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

async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function canUserPost(eventId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  const settings = await getEventSettings(eventId);

  // If no settings, check if user is event creator
  if (!settings) {
    const { data: event } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    return event?.created_by === userId;
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

  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect(`/login?redirect=/events/${slug}/moments/new`);
  }

  const canPost = await canUserPost(event.id, user.id);

  // Redirect if user can't post
  if (!canPost) {
    redirect(`/events/${slug}/moments`);
  }

  // Check if user is event creator (photographer)
  const isPhotographer = event.created_by === user.id;

  const t = await getTranslations("moments");
  const tCommon = await getTranslations("common");

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href={`/events/${slug}/moments`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-lg mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("shareYourMoment")}</h1>
          <p className="text-muted-foreground">{event.title}</p>
        </div>

        {/* Form */}
        <MomentForm
          eventId={event.id}
          eventSlug={slug}
          userId={user.id}
        />

        {/* Pro Upload Link - Only for photographers */}
        {isPhotographer && (
          <div className="mt-6 pt-6 border-t">
            <Link
              href={`/events/${slug}/moments/pro-upload`}
              className="flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all group"
            >
              <Camera className="w-5 h-5" />
              <span className="text-sm font-medium">{t("proUpload.proUploadLink")}</span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
