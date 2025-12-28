import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile, Event } from "@/lib/types";

interface PageProps {
  params: Promise<{ username: string }>;
}

async function getProfile(username: string): Promise<Profile | null> {
  const supabase = await createClient();

  // First try to find by username
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .single();

  // If not found, try by user ID (for profiles without username)
  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", username)
      .single();
    profile = data;
  }

  return profile as Profile | null;
}

async function getUserEvents(userId: string): Promise<Event[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "published")
    .order("starts_at", { ascending: false })
    .limit(10);

  return (data ?? []) as Event[];
}

async function isCurrentUser(profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id === profileId;
}

export default async function ProfilePage({ params }: PageProps) {
  const { username: rawUsername } = await params;
  // Strip @ prefix if present (supports both /@username and /username)
  // URL decode first in case @ is encoded as %40
  const decoded = decodeURIComponent(rawUsername);
  const username = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const profile = await getProfile(username);

  if (!profile) {
    notFound();
  }

  const [events, isOwner] = await Promise.all([
    getUserEvents(profile.id),
    isCurrentUser(profile.id),
  ]);

  const upcomingEvents = events.filter(
    (e) => new Date(e.starts_at) > new Date()
  );
  const pastEvents = events.filter((e) => new Date(e.starts_at) <= new Date());

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div className="flex items-start gap-6 mb-8">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-24 h-24 rounded-full"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/20" />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.display_name || profile.username || "Anonymous"}
            </h1>
            {profile.username && (
              <p className="text-muted-foreground">@{profile.username}</p>
            )}
            {profile.bio && <p className="mt-2">{profile.bio}</p>}
            {isOwner && (
              <Link
                href="/settings/profile"
                className="text-sm text-primary hover:underline mt-2 inline-block"
              >
                Edit profile
              </Link>
            )}
          </div>
        </div>

        {/* Events */}
        <div className="space-y-8">
          {upcomingEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Upcoming Events</h2>
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`}>
                    <Card className="hover:border-foreground/20 transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {format(new Date(event.starts_at), "MMM d")}
                          </span>
                        </div>
                        <span className="font-medium">{event.title}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {pastEvents.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-4 text-muted-foreground">
                Past Events
              </h2>
              <div className="space-y-3">
                {pastEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.slug}`}>
                    <Card className="hover:border-foreground/20 transition-colors opacity-60">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {format(new Date(event.starts_at), "MMM d")}
                          </span>
                        </div>
                        <span className="font-medium">{event.title}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {events.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No events yet
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
