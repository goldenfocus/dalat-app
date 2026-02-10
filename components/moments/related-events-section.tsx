"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Camera, Video, Play, Images } from "lucide-react";
import { useTranslations } from "next-intl";
import { cloudflareLoader } from "@/lib/image-cdn";
import { triggerHaptic } from "@/lib/haptics";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface RelatedEvent {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_image_url: string | null;
  cover_thumbnail_url: string | null;
  photo_count: number;
  video_count: number;
  match_reason: string;
  relevance_score: number;
}

interface RelatedEventsSectionProps {
  eventId: string;
  onNavigate: (eventSlug: string) => void;
  className?: string;
}

/**
 * Dark-themed related events section for the immersive view end screen.
 * Shows events with photo/video moments that are related by venue, organizer, or tags.
 */
export function RelatedEventsSection({
  eventId,
  onNavigate,
  className,
}: RelatedEventsSectionProps) {
  const t = useTranslations();
  const [events, setEvents] = useState<RelatedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchRelated() {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_related_events_with_moments", {
        p_event_id: eventId,
        p_limit: 4,
      });

      if (!error && data) {
        setEvents(data);
      }
      setLoading(false);
    }

    fetchRelated();
  }, [eventId]);

  const handleImageError = (eventId: string) => {
    setBrokenImages((prev) => new Set(prev).add(eventId));
  };

  const getThumbnailUrl = (event: RelatedEvent): string | null => {
    return event.cover_thumbnail_url || event.event_image_url;
  };

  const getMatchLabel = (reason: string): string => {
    switch (reason) {
      case "same_venue":
        return t("moments.endScreen.sameVenue");
      case "same_organizer":
        return t("moments.endScreen.sameOrganizer");
      case "similar_vibe":
        return t("moments.endScreen.similarVibe");
      default:
        return t("moments.endScreen.similarVibe");
    }
  };

  const handleEventClick = (eventSlug: string) => {
    triggerHaptic("selection");
    onNavigate(eventSlug);
  };

  // Loading state
  if (loading) {
    return (
      <div className={cn("animate-in fade-in duration-300", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-white/40" />
          <p className="text-white/40 text-sm font-medium">{t("moments.endScreen.keepExploring")}</p>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[140px] rounded-lg overflow-hidden bg-white/10 animate-pulse"
            >
              <div className="aspect-[4/5] bg-white/5" />
              <div className="p-2 space-y-2">
                <div className="h-3 bg-white/5 rounded w-3/4" />
                <div className="h-2 bg-white/5 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No related events found - don't render anything
  if (events.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "animate-in slide-in-from-bottom-4 duration-500 delay-250",
        className
      )}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-white/60" />
        <p className="text-white/60 text-sm font-medium">
          {t("moments.endScreen.keepExploring")}
        </p>
      </div>

      {/* Horizontal scrollable cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {events.map((event, index) => (
          <button
            key={event.event_id}
            onClick={() => handleEventClick(event.event_slug)}
            className={cn(
              "flex-shrink-0 w-[140px] rounded-lg overflow-hidden",
              "bg-white/10 backdrop-blur-sm",
              "hover:bg-white/15 active:scale-[0.98] transition-all",
              "text-left"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Thumbnail */}
            <div className="relative aspect-[4/5] overflow-hidden">
              {getThumbnailUrl(event) && !brokenImages.has(event.event_id) ? (
                <img
                  src={cloudflareLoader({
                    src: getThumbnailUrl(event)!,
                    width: 280,
                    quality: 80,
                  })}
                  alt={event.event_title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={() => handleImageError(event.event_id)}
                />
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center">
                  <Images className="w-8 h-8 text-white/30" />
                </div>
              )}

              {/* Play button overlay if has videos */}
              {event.video_count > 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}
            </div>

            {/* Info panel */}
            <div className="p-2.5 space-y-1.5">
              {/* Title */}
              <p className="text-white text-[11px] font-medium leading-tight line-clamp-2 min-h-[1.75rem]">
                {event.event_title}
              </p>

              {/* Photo/video counts */}
              <div className="flex items-center gap-1">
                {event.photo_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] text-white/70">
                    <Camera className="w-2.5 h-2.5" />
                    {event.photo_count}
                  </span>
                )}
                {event.video_count > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/10 text-[9px] text-white/70">
                    <Video className="w-2.5 h-2.5" />
                    {event.video_count}
                  </span>
                )}
              </div>

              {/* Match reason pill */}
              <span className="inline-block px-1.5 py-0.5 text-[9px] bg-white/10 rounded text-white/50">
                {getMatchLabel(event.match_reason)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
