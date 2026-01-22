import { Link } from "@/lib/i18n/routing";
import { ArrowLeft, Plus, Calendar, Users, MapPin, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { decodeUnicodeEscapes } from "@/lib/utils";

async function getMyEvents(userId: string) {
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

  const { data } = await supabase
    .from("events")
    .select(
      `
      id,
      title,
      slug,
      starts_at,
      ends_at,
      status,
      location_name,
      event_counts(going_count, interested_count)
    `
    )
    .in("organizer_id", organizerIds)
    .order("starts_at", { ascending: false });

  return data ?? [];
}

export default async function OrganizerEventsPage() {
  const supabase = await createClient();
  const t = await getTranslations("organizerPortal");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const events = await getMyEvents(user.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/organizer"
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-bold">{t("myEvents")}</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your events and track RSVPs
          </p>
        </div>
        {events.length > 0 && (
          <Link
            href="/events/new"
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus className="h-4 w-4" />
            {t("createEvent")}
          </Link>
        )}
      </div>

      {/* Events List */}
      {events.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-sm">Event</th>
                <th className="text-left p-3 font-medium text-sm hidden sm:table-cell">
                  Date
                </th>
                <th className="text-left p-3 font-medium text-sm hidden md:table-cell">
                  RSVPs
                </th>
                <th className="text-left p-3 font-medium text-sm">Status</th>
                <th className="text-right p-3 font-medium text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((event) => {
                const counts = event.event_counts as {
                  going_count?: number;
                  interested_count?: number;
                } | null;
                const startsAt = new Date(event.starts_at);
                const isPast = startsAt < new Date();

                const statusStyles: Record<string, string> = {
                  draft: "bg-yellow-500/10 text-yellow-600",
                  published: "bg-green-500/10 text-green-600",
                  cancelled: "bg-red-500/10 text-red-600",
                };

                return (
                  <tr key={event.id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div>
                        <Link
                          href={`/events/${event.slug}`}
                          className="font-medium hover:text-primary"
                        >
                          {event.title}
                        </Link>
                        {event.location_name && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[200px]">
                              {decodeUnicodeEscapes(event.location_name)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {startsAt.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year:
                              startsAt.getFullYear() !== new Date().getFullYear()
                                ? "numeric"
                                : undefined,
                          })}
                        </span>
                        {isPast && (
                          <span className="text-xs text-muted-foreground/60 ml-1">
                            (past)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {counts?.going_count ?? 0}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          going
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${statusStyles[event.status] || "bg-muted"}`}
                      >
                        {event.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/events/${event.slug}/edit`}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-xs"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Link>
                        <Link
                          href={`/events/${event.slug}`}
                          className="px-2 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-xs"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-20 border rounded-lg bg-card">
          <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-xl font-semibold mb-2">{t("noEventsYet")}</h3>
          <p className="text-muted-foreground mb-6">
            {t("createFirstEvent")}
          </p>
          <Link
            href="/events/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <Plus className="h-5 w-5" />
            {t("createEvent")}
          </Link>
        </div>
      )}
    </div>
  );
}
