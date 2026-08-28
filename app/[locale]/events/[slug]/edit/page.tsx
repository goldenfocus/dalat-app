import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalEventSlug } from "@/lib/events/slug-resolution";

// Increase serverless function timeout
export const maxDuration = 60;
import { EventForm } from "@/components/events/event-form";
import { hasRoleLevel, type Event, type EventPrivateDetails, type Sponsor, type EventSponsor, type EventSettings, type UserRole, type EventMaterial } from "@/lib/types";

interface PlaylistData {
  playlistId: string | null;
  tracks: {
    id: string;
    file_url: string;
    title: string | null;
    artist: string | null;
    album: string | null;
    thumbnail_url: string | null;
    duration_seconds: number | null;
    sort_order: number;
  }[];
}

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

export default async function EditEventPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const canonicalSlug = await resolveCanonicalEventSlug(supabase, slug);
  if (!canonicalSlug) {
    notFound();
  }
  if (canonicalSlug !== slug) {
    redirect(`/${locale}/events/${canonicalSlug}/edit`);
  }

  // Fetch the event
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", canonicalSlug)
    .single();

  if (error || !event) {
    notFound();
  }

  // Check if user is the creator or an admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isCreator = event.created_by === user.id;
  const isAdmin = profile?.role ? hasRoleLevel(profile.role as UserRole, "admin") : false;

  if (!isCreator && !isAdmin) {
    redirect(`/${locale}/events/${canonicalSlug}`);
  }

  // Fetch the real location for secret events (RLS: host/admin only)
  let privateDetails: EventPrivateDetails | null = null;
  if (event.has_private_details) {
    const { data } = await supabase
      .from("event_private_details")
      .select("*")
      .eq("event_id", event.id)
      .maybeSingle();
    privateDetails = data as EventPrivateDetails | null;
  }

  // Fetch sponsors for this event
  const { data: eventSponsors } = await supabase
    .from("event_sponsors")
    .select("*, sponsors(*)")
    .eq("event_id", event.id)
    .order("sort_order");

  const sponsors = (eventSponsors || []) as (EventSponsor & { sponsors: Sponsor })[];

  // Fetch event settings (for moments config, retranslate, etc.)
  const { data: settings } = await supabase
    .from("event_settings")
    .select("*")
    .eq("event_id", event.id)
    .single();

  // Fetch event materials
  const { data: materials } = await supabase
    .from("event_materials")
    .select("*")
    .eq("event_id", event.id)
    .order("sort_order");

  // Fetch playlist and tracks
  const { data: playlist } = await supabase
    .from("event_playlists")
    .select("id")
    .eq("event_id", event.id)
    .single();

  let playlistData: PlaylistData = { playlistId: null, tracks: [] };
  if (playlist) {
    const { data: tracks } = await supabase
      .from("playlist_tracks")
      .select("id, file_url, title, artist, album, thumbnail_url, duration_seconds, sort_order")
      .eq("playlist_id", playlist.id)
      .order("sort_order");

    playlistData = {
      playlistId: playlist.id,
      tracks: tracks || [],
    };
  }

  // Get pending moments count for moderation badge
  const { data: counts } = await supabase.rpc("get_moment_counts", {
    p_event_id: event.id,
  });
  const pendingCount = (counts as { pending_count?: number } | null)?.pending_count ?? 0;

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Edit Event</h1>
        <EventForm
          userId={user.id}
          userRole={(profile?.role as UserRole) ?? "user"}
          event={event as Event}
          initialSponsors={sponsors}
          initialMaterials={(materials ?? []) as EventMaterial[]}
          initialSettings={settings as EventSettings | null}
          pendingMomentsCount={pendingCount}
          initialPlaylistId={playlistData.playlistId}
          initialPlaylistTracks={playlistData.tracks}
          initialPrivateDetails={privateDetails}
        />
      </div>
    </main>
  );
}
