"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, ChevronLeft, ChevronRight, Play, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { VenueCommunityMoment } from "@/lib/types";
import { getCfStreamThumbnailUrl } from "@/lib/media-utils";
import { Link } from "@/lib/i18n/routing";

interface VenueCommunityPhotosProps {
  venueId: string;
  locale: string;
  initialLimit?: number;
}

export function VenueCommunityPhotos({
  venueId,
  locale,
  initialLimit = 12,
}: VenueCommunityPhotosProps) {
  const t = useTranslations("venues");
  const [moments, setMoments] = useState<VenueCommunityMoment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isOpen = lightboxIndex !== null;

  // Fetch community moments
  const fetchMoments = useCallback(
    async (offset: number = 0, limit: number = initialLimit) => {
      const supabase = createClient();

      const { data, error } = await supabase.rpc("get_venue_community_moments", {
        p_venue_id: venueId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error("Error fetching community moments:", error);
        return [];
      }

      return data as VenueCommunityMoment[];
    },
    [venueId, initialLimit]
  );

  // Fetch total count
  const fetchCount = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase.rpc("get_venue_community_moments_count", {
      p_venue_id: venueId,
    });

    if (error) {
      console.error("Error fetching community moments count:", error);
      return 0;
    }

    return data as number;
  }, [venueId]);

  // Initial load
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      const [initialMoments, count] = await Promise.all([fetchMoments(0), fetchCount()]);
      setMoments(initialMoments);
      setTotalCount(count);
      setLoading(false);
    }
    loadInitial();
  }, [fetchMoments, fetchCount]);

  // Load more
  const handleLoadMore = async () => {
    setLoadingMore(true);
    const moreMoments = await fetchMoments(moments.length);
    setMoments((prev) => [...prev, ...moreMoments]);
    setLoadingMore(false);
  };

  // Lightbox navigation
  const handlePrevious = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === 0 ? moments.length - 1 : lightboxIndex - 1);
  }, [lightboxIndex, moments.length]);

  const handleNext = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex(lightboxIndex === moments.length - 1 ? 0 : lightboxIndex + 1);
  }, [lightboxIndex, moments.length]);

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowLeft") handlePrevious();
      if (e.key === "ArrowRight") handleNext();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleClose, handlePrevious, handleNext]);

  // Filter to only photo/video moments
  const photoMoments = moments.filter((m) => m.content_type !== "text" && m.media_url);

  // Loading skeleton
  if (loading) {
    return (
      <section className="mb-8 pt-2">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t("communityPhotos")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  // No photos — just hide the section entirely
  if (photoMoments.length === 0) {
    return null;
  }

  const currentMoment = lightboxIndex !== null ? photoMoments[lightboxIndex] : null;
  const hasMore = photoMoments.length < totalCount;

  return (
    <>
      <section className="mb-8 pt-2">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t("communityPhotos")}
          <span className="text-sm font-normal text-muted-foreground">
            ({totalCount})
          </span>
        </h2>

        {/* Photo Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photoMoments.map((moment, index) => (
            <button
              key={moment.id}
              onClick={() => setLightboxIndex(index)}
              className="relative aspect-square rounded-lg overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-[0.98] transition-transform group"
            >
              {(() => {
                const thumbUrl =
                  moment.content_type === "video"
                    ? moment.thumbnail_url || getCfStreamThumbnailUrl(moment.cf_playback_url) || moment.media_url
                    : moment.media_url;
                return thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted" />
                );
              })()}

              {/* Video indicator */}
              {moment.content_type === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="w-6 h-6 text-white fill-white" />
                  </div>
                </div>
              )}

              {/* User info overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center gap-2">
                  {moment.avatar_url ? (
                    <img
                      src={moment.avatar_url}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover border border-white/30"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/20" />
                  )}
                  <span className="text-xs text-white truncate">
                    {moment.display_name || moment.username}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Load more button */}
        {hasMore && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full mt-4 py-3 px-4 rounded-lg border border-border hover:bg-muted transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            {loadingMore ? "..." : t("loadMore")}
          </button>
        )}
      </section>

      {/* Lightbox */}
      {isOpen && currentMoment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={handleClose}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Navigation buttons */}
          {photoMoments.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevious();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95"
                aria-label="Next photo"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          {/* Content container */}
          <div
            className="relative z-10 max-w-[95vw] max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {currentMoment.content_type === "video" ? (
              <video
                src={currentMoment.cf_playback_url || currentMoment.media_url!}
                controls
                autoPlay
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={currentMoment.media_url!}
                alt=""
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
              />
            )}

            {/* User and event info */}
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                {currentMoment.avatar_url ? (
                  <img
                    src={currentMoment.avatar_url}
                    alt=""
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/20" />
                )}
                <span className="text-white/90 text-sm">
                  {currentMoment.display_name || currentMoment.username}
                </span>
              </div>

              <Link
                href={`/events/${currentMoment.event_slug}`}
                className="text-white/60 text-sm hover:text-white/80 transition-colors"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {t("postedAt", { event: currentMoment.event_title })}
              </Link>
            </div>
          </div>

          {/* Photo counter */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-white/50 text-sm">
            {lightboxIndex + 1} / {photoMoments.length}
          </p>
        </div>
      )}
    </>
  );
}
