import { redirect } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/events/event-form";
import type { Event, Sponsor, EventSponsor } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ copyFrom?: string }>;
}

// Data to copy from source event
interface CopyFromData {
  event: Event;
  sponsors: (EventSponsor & { sponsors: Sponsor })[];
}

async function getCopyFromData(eventId: string): Promise<CopyFromData | null> {
  const supabase = await createClient();

  // Fetch source event
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error || !event) return null;

  // Fetch sponsors for this event
  const { data: eventSponsors } = await supabase
    .from("event_sponsors")
    .select("*, sponsors(*)")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  return {
    event: event as Event,
    sponsors: (eventSponsors || []) as (EventSponsor & { sponsors: Sponsor })[],
  };
}

export default async function NewEventPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { copyFrom } = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // If copying from another event, fetch its data
  let copyFromData: CopyFromData | null = null;
  if (copyFrom) {
    copyFromData = await getCopyFromData(copyFrom);
  }

  const isCopying = !!copyFromData;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-2xl items-center mx-auto px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-2xl mx-auto px-4 py-8">
        {copyFromData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 bg-muted/50 rounded-lg">
            <Copy className="w-4 h-4" />
            <span>Creating from: <strong className="text-foreground">{copyFromData.event.title}</strong></span>
          </div>
        )}
        <h1 className="text-2xl font-bold mb-8">
          {isCopying ? "Create Similar Event" : "Create Event"}
        </h1>
        <EventForm
          userId={user.id}
          copyFromEvent={copyFromData?.event}
          copyFromSponsors={copyFromData?.sponsors}
        />
      </div>
    </main>
  );
}
