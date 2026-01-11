import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Calendar, MapPin, Users, ExternalLink, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { RsvpButton } from "@/components/events/rsvp-button";
import { EventActions } from "@/components/events/event-actions";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { CopyAddress } from "@/components/events/copy-address";
import { ConfirmAttendanceHandler } from "@/components/events/confirm-attendance-handler";
import { AttendeeList } from "@/components/events/attendee-list";
import { formatInDaLat } from "@/lib/timezone";
import { isVideoUrl } from "@/lib/media-utils";
import type { Event, EventCounts, Rsvp, Profile } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getEvent(slug: string) {
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*, profiles(*)")
    .eq("slug", slug)
    .single();

  if (error || !event) {
    return null;
  }

  return event as Event & { profiles: Profile };
}

async function getEventCounts(eventId: string): Promise<EventCounts | null> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_event_counts", {
    p_event_id: eventId,
  });

  return data as EventCounts | null;
}

async function getCurrentUserRsvp(eventId: string): Promise<Rsvp | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("rsvps")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .single();

  return data as Rsvp | null;
}

async function getWaitlistPosition(eventId: string, userId: string | null): Promise<number | null> {
  if (!userId) return null;

  const supabase = await createClient();

  // Get all waitlist entries ordered by created_at (FIFO)
  const { data } = await supabase
    .from("rsvps")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "waitlist")
    .order("created_at", { ascending: true });

  if (!data) return null;

  const position = data.findIndex((rsvp) => rsvp.user_id === userId);
  return position >= 0 ? position + 1 : null; // 1-indexed position
}

async function getAttendees(eventId: string): Promise<(Rsvp & { profiles: Profile })[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("rsvps")
    .select("*, profiles(*)")
    .eq("event_id", eventId)
    .eq("status", "going")
    .order("created_at", { ascending: true });

  return (data ?? []) as (Rsvp & { profiles: Profile })[];
}

async function getWaitlist(eventId: string): Promise<(Rsvp & { profiles: Profile })[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("rsvps")
    .select("*, profiles(*)")
    .eq("event_id", eventId)
    .eq("status", "waitlist")
    .order("created_at", { ascending: true });

  return (data ?? []) as (Rsvp & { profiles: Profile })[];
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export default async function EventPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) {
    notFound();
  }

  const currentUserId = await getCurrentUserId();

  const [counts, currentRsvp, attendees, waitlist, waitlistPosition] = await Promise.all([
    getEventCounts(event.id),
    getCurrentUserRsvp(event.id),
    getAttendees(event.id),
    getWaitlist(event.id),
    getWaitlistPosition(event.id, currentUserId),
  ]);

  const isLoggedIn = !!currentUserId;
  const isCreator = currentUserId === event.created_by;

  const spotsText = event.capacity
    ? `${counts?.going_spots ?? 0}/${event.capacity}`
    : `${counts?.going_spots ?? 0}`;

  return (
    <main className="min-h-screen">
      <Suspense fallback={null}>
        <ConfirmAttendanceHandler eventId={event.id} />
      </Suspense>

      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
          {isCreator && (
            <EventActions eventId={event.id} eventSlug={event.slug} />
          )}
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event image/video */}
            {event.image_url && (
              <div className="aspect-video rounded-lg overflow-hidden">
                {isVideoUrl(event.image_url) ? (
                  <video
                    src={event.image_url}
                    className="object-cover w-full h-full"
                    controls
                    muted
                    loop
                    playsInline
                    autoPlay
                  />
                ) : (
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="object-cover w-full h-full"
                  />
                )}
              </div>
            )}

            {/* Title and description */}
            <div>
              <h1 className="text-3xl font-bold mb-4">{event.title}</h1>
              {event.description && (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {event.description}
                </p>
              )}
            </div>

            {/* Attendees */}
            <AttendeeList attendees={attendees} waitlist={waitlist} />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* RSVP card */}
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Date/time */}
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {formatInDaLat(event.starts_at, "EEEE, MMMM d")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatInDaLat(event.starts_at, "h:mm a")}
                      {event.ends_at &&
                        ` - ${formatInDaLat(event.ends_at, "h:mm a")}`}
                    </p>
                  </div>
                </div>

                {/* Location */}
                {(event.location_name || event.address) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-1">
                      {event.location_name && (
                        <p className="font-medium">{event.location_name}</p>
                      )}
                      {event.address && (
                        <CopyAddress address={event.address} />
                      )}
                      {event.google_maps_url && (
                        <a
                          href={event.google_maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          View on map
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Spots */}
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{spotsText} going</p>
                    {(counts?.waitlist_count ?? 0) > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {counts?.waitlist_count} on waitlist
                      </p>
                    )}
                  </div>
                </div>

                {/* External chat link */}
                {event.external_chat_url && (
                  <a
                    href={event.external_chat_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Join the chat
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                <hr />

                {/* RSVP button */}
                <RsvpButton
                  eventId={event.id}
                  capacity={event.capacity}
                  goingSpots={counts?.going_spots ?? 0}
                  currentRsvp={currentRsvp}
                  isLoggedIn={isLoggedIn}
                  waitlistPosition={waitlistPosition}
                />

                {/* Add to calendar */}
                <AddToCalendar
                  title={event.title}
                  description={event.description}
                  locationName={event.location_name}
                  address={event.address}
                  googleMapsUrl={event.google_maps_url}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                  url={`https://dalat.app/events/${event.slug}`}
                />
              </CardContent>
            </Card>

            {/* Organizer */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Organized by
                </p>
                <Link
                  href={`/${event.profiles?.username || event.created_by}`}
                  className="flex items-center gap-3 hover:bg-muted p-2 -m-2 rounded-lg transition-colors"
                >
                  {event.profiles?.avatar_url ? (
                    <img
                      src={event.profiles.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/20" />
                  )}
                  <span className="font-medium">
                    {event.profiles?.display_name ||
                      event.profiles?.username ||
                      "Anonymous"}
                  </span>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
