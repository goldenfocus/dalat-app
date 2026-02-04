"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Pencil, Image as ImageIcon, Play, FileText, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EventPromoMedia, PromoSource } from "@/lib/types";

interface PromoMediaSectionProps {
  promo: EventPromoMedia[];
  isOwner: boolean;
  promoSource?: PromoSource;
  onEditClick?: () => void;
}

export function PromoMediaSection({
  promo,
  isOwner,
  promoSource,
  onEditClick,
}: PromoMediaSectionProps) {
  const t = useTranslations("promo");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (promo.length === 0) {
    // Only show empty state for owners
    if (!isOwner) return null;

    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center">
        <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground mb-3">{t("noPromo")}</p>
        {onEditClick && (
          <Button variant="outline" size="sm" onClick={onEditClick}>
            <Sparkles className="w-4 h-4 mr-2" />
            {t("addPromo")}
          </Button>
        )}
      </div>
    );
  }

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const goNext = () => setLightboxIndex((i) => (i !== null && i < promo.length - 1 ? i + 1 : i));
  const goPrev = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-sm">{t("title")}</h3>
          {promoSource === "series" && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {t("usingSeriesPromo")}
            </span>
          )}
        </div>
        {isOwner && onEditClick && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditClick}
            className="h-8 px-2 text-muted-foreground"
          >
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {t("editPromo")}
          </Button>
        )}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {promo.slice(0, 8).map((item, index) => (
          <PromoThumbnail
            key={item.id}
            item={item}
            onClick={() => openLightbox(index)}
          />
        ))}
        {promo.length > 8 && (
          <button
            onClick={() => openLightbox(8)}
            className="aspect-square rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <span className="text-sm font-medium">+{promo.length - 8}</span>
          </button>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxIndex !== null} onOpenChange={() => closeLightbox()}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none">
          <div className="relative w-full h-[80vh] flex items-center justify-center">
            {/* Close button */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Navigation */}
            {lightboxIndex !== null && lightboxIndex > 0 && (
              <button
                onClick={goPrev}
                className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {lightboxIndex !== null && lightboxIndex < promo.length - 1 && (
              <button
                onClick={goNext}
                className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Content */}
            {lightboxIndex !== null && (
              <PromoLightboxContent item={promo[lightboxIndex]} />
            )}

            {/* Counter */}
            {lightboxIndex !== null && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                {lightboxIndex + 1} / {promo.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PromoThumbnail({
  item,
  onClick,
}: {
  item: EventPromoMedia;
  onClick: () => void;
}) {
  const isVideo = item.media_type === "video";
  const isYouTube = item.media_type === "youtube";
  const isPdf = item.media_type === "pdf";

  const thumbnailUrl = item.thumbnail_url || item.media_url;
  const youTubeThumbnail = item.youtube_video_id
    ? `https://img.youtube.com/vi/${item.youtube_video_id}/mqdefault.jpg`
    : null;

  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-lg overflow-hidden relative group bg-muted"
    >
      {(item.media_type === "image" || isVideo) && thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt={item.title || "Promo"}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      )}
      {isYouTube && youTubeThumbnail && (
        <img
          src={youTubeThumbnail}
          alt={item.title || "YouTube video"}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
      )}
      {isPdf && (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      {!thumbnailUrl && !youTubeThumbnail && !isPdf && (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <ImageIcon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}

      {/* Video/YouTube play icon overlay */}
      {(isVideo || isYouTube) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
    </button>
  );
}

function PromoLightboxContent({ item }: { item: EventPromoMedia }) {
  if (item.media_type === "image" && item.media_url) {
    return (
      <img
        src={item.media_url}
        alt={item.title || "Promo"}
        className="max-w-full max-h-full object-contain"
      />
    );
  }

  if (item.media_type === "video" && item.media_url) {
    return (
      <video
        src={item.media_url}
        controls
        autoPlay
        className="max-w-full max-h-full"
      />
    );
  }

  if (item.media_type === "youtube" && item.youtube_video_id) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${item.youtube_video_id}?autoplay=1`}
        className="w-full h-full max-w-3xl aspect-video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (item.media_type === "pdf" && item.media_url) {
    return (
      <iframe
        src={item.media_url}
        className="w-full h-full"
        title={item.title || "PDF Document"}
      />
    );
  }

  return (
    <div className="text-white text-center">
      <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
      <p>Media not available</p>
    </div>
  );
}
