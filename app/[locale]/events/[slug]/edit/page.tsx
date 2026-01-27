import { notFound, redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// Increase serverless function timeout
export const maxDuration = 60;
import { EventForm } from "@/components/events/event-form";
import { hasRoleLevel, type Event, type Sponsor, type EventSponsor, type EventSettings, type UserRole, type EventMaterial } from "@/lib/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function EditEventPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch the event
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
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
    redirect(`/events/${slug}`);
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

  // Get pending moments count for moderation badge
  const { data: counts } = await supabase.rpc("get_moment_counts", {
    p_event_id: event.id,
  });
  const pendingCount = (counts as { pending_count?: number } | null)?.pending_count ?? 0;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-2xl items-center mx-auto px-4">
          <Link
            href={`/events/${slug}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to event</span>
          </Link>
        </div>
      </nav>

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
        />
      </div>
    </main>
  );
}
