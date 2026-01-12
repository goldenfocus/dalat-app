import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { isVideoUrl } from "@/lib/media-utils";
import { formatInDaLat } from "@/lib/timezone";
import type { Moment, Event, Profile } from "@/lib/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

type MomentWithDetails = Moment & {
  profiles: Profile;
  events: Event;
};

async function getMoment(id: string): Promise<MomentWithDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("moments")
    .select("*, profiles(*), events(*)")
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !data) return null;

  return data as MomentWithDetails;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const moment = await getMoment(id);

  if (!moment) {
    return { title: "Moment not found" };
  }

  const userName = moment.profiles?.display_name || moment.profiles?.username || "Someone";
  const eventTitle = moment.events?.title || "an event";
  const description = moment.text_content
    ? moment.text_content.slice(0, 150)
    : `${userName} shared a moment from ${eventTitle}`;

  return {
    title: `${userName}'s moment at ${eventTitle} | dalat.app`,
    description,
    openGraph: {
      title: `${userName}'s moment at ${eventTitle}`,
      description,
      type: "article",
      url: `/moments/${id}`,
      siteName: "dalat.app",
      ...(moment.media_url && !isVideoUrl(moment.media_url) && {
        images: [
          {
            url: moment.media_url,
            width: 1200,
            height: 630,
            alt: `Moment from ${eventTitle}`,
          },
        ],
      }),
    },
    twitter: {
      card: moment.media_url ? "summary_large_image" : "summary",
      title: `${userName}'s moment at ${eventTitle}`,
      description,
      ...(moment.media_url && !isVideoUrl(moment.media_url) && {
        images: [moment.media_url],
      }),
    },
  };
}

export default async function MomentPage({ params }: PageProps) {
  const { id } = await params;
  const moment = await getMoment(id);

  if (!moment) {
    notFound();
  }

  const t = await getTranslations("moments");
  const tCommon = await getTranslations("common");
  const tEvents = await getTranslations("events");

  const event = moment.events;
  const profile = moment.profiles;
  const isVideo = isVideoUrl(moment.media_url);
  const timeAgo = formatDistanceToNow(new Date(moment.created_at), { addSuffix: true });

  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-4xl items-center mx-auto px-4">
          <Link
            href={`/events/${event.slug}/moments`}
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>
      </nav>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        {/* Media display */}
        {moment.content_type !== "text" && moment.media_url && (
          <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-6">
            {isVideo ? (
              <video
                src={moment.media_url}
                className="w-full h-full object-contain"
                controls
                playsInline
                autoPlay
                loop
              />
            ) : (
              <img
                src={moment.media_url}
                alt=""
                className="w-full h-full object-contain"
              />
            )}
          </div>
        )}

        {/* User info and caption */}
        <div className="space-y-4">
          {/* User */}
          <div className="flex items-center gap-3">
            <Link href={`/${profile?.username || moment.user_id}`}>
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary/20" />
              )}
            </Link>
            <div>
              <Link
                href={`/${profile?.username || moment.user_id}`}
                className="font-medium hover:underline"
              >
                {profile?.display_name || profile?.username || tCommon("anonymous")}
              </Link>
              <p className="text-sm text-muted-foreground">{timeAgo}</p>
            </div>
          </div>

          {/* Caption / Text */}
          {moment.text_content && (
            <p className="text-lg whitespace-pre-wrap">{moment.text_content}</p>
          )}

          {/* Event card */}
          <Card className="mt-6">
            <CardContent className="p-4">
              <Link
                href={`/events/${event.slug}`}
                className="block hover:bg-muted -m-4 p-4 rounded-lg transition-colors"
              >
                <div className="flex gap-4">
                  {event.image_url && (
                    <img
                      src={event.image_url}
                      alt=""
                      className="w-20 h-20 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold line-clamp-2">{event.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatInDaLat(event.starts_at, "EEE, MMM d")}</span>
                    </div>
                    {event.location_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <MapPin className="w-4 h-4" />
                        <span className="truncate">{event.location_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* View all moments link */}
          <div className="text-center pt-4">
            <Link
              href={`/events/${event.slug}/moments`}
              className="text-primary hover:underline text-sm"
            >
              {t("viewAll")} →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
