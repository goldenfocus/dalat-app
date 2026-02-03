import { redirect } from "next/navigation";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";

// Increase serverless function timeout
export const maxDuration = 60;
import { EventForm } from "@/components/events/event-form";
import type { Event, Sponsor, EventSponsor, UserRole } from "@/lib/types";

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
  const t = await getTranslations("eventForm");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch user profile to get role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // If copying from another event, fetch its data
  let copyFromData: CopyFromData | null = null;
  if (copyFrom) {
    copyFromData = await getCopyFromData(copyFrom);
  }

  const isCopying = !!copyFromData;

  return (
    <main className="min-h-screen">
      <div className="container max-w-2xl mx-auto px-4 py-8">
        {copyFromData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 p-3 bg-muted/50 rounded-lg">
            <Copy className="w-4 h-4" />
            <span>Creating from: <strong className="text-foreground">{copyFromData.event.title}</strong></span>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            {isCopying ? t("pageTitleCopy") : t("pageTitle")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("pageSubtitle")}
          </p>
        </div>
        <EventForm
          userId={user.id}
          userRole={(profile?.role as UserRole) ?? "user"}
          copyFromEvent={copyFromData?.event}
          copyFromSponsors={copyFromData?.sponsors}
        />
      </div>
    </main>
  );
}
