import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRoleLevel, type Rsvp, type Profile, type UserRole, type PlusOneGuest } from "@/lib/types";
import { CheckinInterface } from "@/components/events/checkin/checkin-interface";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export type CheckinAttendee = Rsvp & {
  profiles: Profile;
  plus_one_guests: PlusOneGuest[];
  auth_email?: string;
};

export default async function CheckinPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : null;
  const supabase = await createClient();

  // Get current user (must be logged in)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return notFound();

  // Get event (include checkin_code for validation)
  const { data: event } = await supabase
    .from("events")
    .select("id, slug, title, created_by, capacity, starts_at, ends_at, checkin_code")
    .eq("slug", slug)
    .single();

  if (!event) return notFound();

  // Permission gate: creator, admin, OR valid checkin code
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isCreator = user.id === event.created_by;
  const isAdmin = profile?.role
    ? hasRoleLevel(profile.role as UserRole, "admin")
    : false;
  const hasValidCode = code !== null && event.checkin_code === code;
  const isOrganizer = isCreator || isAdmin;

  if (!isOrganizer && !hasValidCode) return notFound();

  // Fetch all "going" RSVPs with profiles and plus-one guests
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("*, profiles(*), plus_one_guests(*)")
    .eq("event_id", event.id)
    .eq("status", "going")
    .order("created_at", { ascending: true });

  const attendees = (rsvps ?? []) as CheckinAttendee[];

  return (
    <CheckinInterface
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      capacity={event.capacity}
      attendees={attendees}
      checkinCode={hasValidCode ? code : isOrganizer ? event.checkin_code : null}
      isOrganizer={isOrganizer}
    />
  );
}
