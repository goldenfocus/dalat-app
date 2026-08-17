"use client";

import { createClient } from "@/lib/supabase/client";

export type SeriesMomentMediaType = "image" | "video" | "youtube" | "pdf" | null;

export interface PublishedSeriesMoment {
  id: string;
  media_url: string | null;
  media_type: SeriesMomentMediaType;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  text_content: string | null;
  event_slug: string;
  event_title: string;
  event_date: string;
  quality_score: number | null;
}

interface SeriesEventRow {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
}

interface MomentRow {
  id: string;
  media_url: string | null;
  content_type: string | null;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  text_content: string | null;
  event_id: string;
  moment_metadata:
    | { quality_score: number | null }[]
    | { quality_score: number | null }
    | null;
}

type SeriesMomentsClient = ReturnType<typeof createClient>;

export function normalizeMomentMediaType(contentType: string | null): SeriesMomentMediaType {
  switch (contentType) {
    case "photo":
    case "image":
      return "image";
    case "video":
    case "youtube":
    case "pdf":
      return contentType;
    default:
      return null;
  }
}

export async function fetchPublishedSeriesMoments(
  {
    seriesId,
    currentEventId,
    now = new Date(),
    limit = 120,
  }: {
    seriesId: string;
    currentEventId: string;
    now?: Date;
    limit?: number;
  },
  supabase: SeriesMomentsClient = createClient()
): Promise<PublishedSeriesMoment[]> {
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, slug, title, starts_at")
    .eq("series_id", seriesId)
    .eq("status", "published")
    .neq("id", currentEventId)
    .lt("starts_at", now.toISOString())
    .order("starts_at", { ascending: false });

  if (eventsError) {
    throw new Error(`Failed to load past series events: ${eventsError.message}`);
  }

  if (!events?.length) return [];

  const typedEvents = events as SeriesEventRow[];
  const eventIds = typedEvents.map((event) => event.id);
  const eventMap = new Map(typedEvents.map((event) => [event.id, event]));

  const { data: moments, error: momentsError } = await supabase
    .from("moments")
    .select(
      "id, media_url, content_type, thumbnail_url, youtube_video_id, text_content, event_id, moment_metadata(quality_score)"
    )
    .in("event_id", eventIds)
    .eq("status", "published")
    .in("content_type", ["photo", "image", "video", "youtube", "pdf"])
    .not("media_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (momentsError) {
    throw new Error(`Failed to load published series moments: ${momentsError.message}`);
  }

  if (!moments?.length) return [];

  return (moments as MomentRow[]).flatMap((moment) => {
    const event = eventMap.get(moment.event_id);
    const mediaType = normalizeMomentMediaType(moment.content_type);
    if (!event || !mediaType) return [];

    const metadata = Array.isArray(moment.moment_metadata)
      ? moment.moment_metadata[0]
      : moment.moment_metadata;

    return [{
      id: moment.id,
      media_url: moment.media_url,
      media_type: mediaType,
      thumbnail_url: moment.thumbnail_url,
      youtube_video_id: moment.youtube_video_id,
      text_content: moment.text_content,
      event_slug: event.slug,
      event_title: event.title,
      event_date: event.starts_at,
      quality_score: metadata?.quality_score ?? null,
    }];
  });
}
