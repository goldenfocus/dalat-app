import { Link } from "@/lib/i18n/routing";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  Calendar,
  PartyPopper,
  Users,
  Plus,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/admin/analytics";

async function getOrganizerStats(userId: string) {
  const supabase = await createClient();

  // Get user's organizer(s)
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", userId);

  const organizerIds = organizers?.map((o) => o.id) ?? [];

  if (organizerIds.length === 0) {
    return {
      eventsCount: 0,
      festivalsCount: 0,
      totalRsvps: 0,
      upcomingEventsCount: 0,
    };
  }

  // Get events count for this organizer
  const { count: eventsCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .in("organizer_id", organizerIds);

  // Get festivals count (created by this user)
  const { count: festivalsCount } = await supabase
    .from("festivals")
    .select("*", { count: "exact", head: true })
    .eq("created_by", userId);

  // Get total RSVPs for organizer's events
  const { data: rsvpData } = await supabase
    .from("events")
    .select("id, event_counts(going_count, interested_count)")
    .in("organizer_id", organizerIds);

  const totalRsvps =
    rsvpData?.reduce((sum, event) => {
      const counts = event.event_counts as {
        going_count?: number;
        interested_count?: number;
      } | null;
      return sum + (counts?.going_count ?? 0) + (counts?.interested_count ?? 0);
    }, 0) ?? 0;

  // Get upcoming events count
  const now = new Date().toISOString();
  const { count: upcomingEventsCount } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .in("organizer_id", organizerIds)
    .gte("starts_at", now)
    .eq("status", "published");

  return {
    eventsCount: eventsCount ?? 0,
    festivalsCount: festivalsCount ?? 0,
    totalRsvps,
    upcomingEventsCount: upcomingEventsCount ?? 0,
  };
}

async function getRecentEvents(userId: string, limit = 5) {
  const supabase = await createClient();

  // Get user's organizer(s)
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id")
    .eq("owner_id", userId);

  const organizerIds = organizers?.map((o) => o.id) ?? [];

  if (organizerIds.length === 0) {
    return [];
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, starts_at, status, event_counts(going_count)")
    .in("organizer_id", organizerIds)
    .order("starts_at", { ascending: false })
    .limit(limit);

  return events ?? [];
}

export default async function OrganizerDashboard() {
  const supabase = await createClient();
  const t = await getTranslations("organizerPortal");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const stats = await getOrganizerStats(user.id);
  const recentEvents = await getRecentEvents(user.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{t("dashboard")}</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your events and festivals
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          title={t("myEvents")}
          value={stats.eventsCount}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title={t("myFestivals")}
          value={stats.festivalsCount}
          icon={<PartyPopper className="h-5 w-5" />}
        />
        <StatCard
          title={t("totalRsvps")}
          value={stats.totalRsvps}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title={t("upcomingEvents")}
          value={stats.upcomingEventsCount}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">{t("quickActions")}</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/events/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("createEvent")}
          </Link>
          <Link
            href="/organizer/festivals/new"
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <PartyPopper className="h-4 w-4" />
            {t("createFestival")}
          </Link>
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-lg font-semibold">{t("recentActivity")}</h2>
          <Link
            href="/organizer/events"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {t("viewAllEvents")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {recentEvents.length > 0 ? (
          <div className="divide-y">
            {recentEvents.map((event) => {
              const counts = event.event_counts as {
                going_count?: number;
              } | null;
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between px-4 sm:px-6 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/events/${event.slug}`}
                      className="font-medium hover:text-primary truncate block"
                    >
                      {event.title}
                    </Link>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        {new Date(event.starts_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {counts?.going_count ?? 0} going
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      event.status === "published"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-yellow-500/10 text-yellow-600"
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 pt-0 text-center text-muted-foreground">
            <p>{t("noEventsYet")}</p>
            <Link
              href="/events/new"
              className="text-primary hover:underline text-sm"
            >
              {t("createFirstEvent")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
