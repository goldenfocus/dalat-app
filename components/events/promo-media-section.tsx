"use client";

import { useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Sparkles, Pencil, Image as ImageIcon, Play, FileText, X, ChevronLeft, ChevronRight, Images, Loader2, Check, Repeat, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage/client";
import type { EventPromoMedia, PromoSource, PromoUpdateScope } from "@/lib/types";

interface PastMoment {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  event_slug: string;
  event_title: string;
  event_date: string;
}

interface PromoMediaSectionProps {
  promo: EventPromoMedia[];
  isOwner: boolean;
  promoSource?: PromoSource;
  onEditClick?: () => void;
  // Optional props for inline promo management (when provided, enables editing)
  eventId?: string;
  eventSlug?: string;
  seriesId?: string | null;
  isSeriesEvent?: boolean;
  pastMoments?: PastMoment[];
  vibeMomentIds?: string[] | null;
}

interface SeriesMoment {
  id: string;
  media_url: string | null;
  media_type: "image" | "video" | "youtube" | "pdf" | null;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  text_content: string | null;
  event_slug: string;
  event_title: string;
  event_date: string;
  quality_score: number | null;
}

export function PromoMediaSection({
  promo: initialPromo,
  isOwner,
  promoSource: initialPromoSource,
  onEditClick,
  eventId,
  eventSlug,
  seriesId,
  isSeriesEvent = false,
  pastMoments = [],
  vibeMomentIds,
}: PromoMediaSectionProps) {
  const t = useTranslations("promo");
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // State for inline promo management
  const [promo, setPromo] = useState(initialPromo);
  const [promoSource, setPromoSource] = useState(initialPromoSource);
  const [showPicker, setShowPicker] = useState(false);
  const [showVibeCurator, setShowVibeCurator] = useState(false);
  const [seriesMoments, setSeriesMoments] = useState<SeriesMoment[]>([]);
  const [selectedMomentIds, setSelectedMomentIds] = useState<Set<string>>(new Set());
  const [selectedVibeMomentIds, setSelectedVibeMomentIds] = useState<Set<string>>(
    new Set(vibeMomentIds ?? [])
  );
  const [isLoadingMoments, setIsLoadingMoments] = useState(false);
  const [updateScope, setUpdateScope] = useState<PromoUpdateScope>("this_event");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingVibes, setIsSavingVibes] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Can we manage promo inline? (need eventSlug at minimum)
  const canManageInline = isOwner && !!eventSlug;
  const canImportFromSeries = isSeriesEvent && !!seriesId;

  const fetchPromo = useCallback(async () => {
    if (!eventSlug) return;
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo`);
      if (response.ok) {
        const data = await response.json();
        setPromo(data.promo || []);
        setPromoSource(data.promo?.[0]?.promo_source);
      }
    } catch (error) {
      console.error("Failed to fetch promo:", error);
    }
  }, [eventSlug]);

  const fetchSeriesMoments = useCallback(async () => {
    if (!seriesId) return;
    setIsLoadingMoments(true);
    try {
      const supabase = createClient();
      const { data: events } = await supabase
        .from("events")
        .select("id, slug, title, starts_at")
        .eq("series_id", seriesId)
        .order("starts_at", { ascending: false });

      if (!events?.length) { setSeriesMoments([]); return; }

      type SeriesEvent = { id: string; slug: string; title: string; starts_at: string };
      const typedEvents = events as SeriesEvent[];
      const eventIds = typedEvents.map((e) => e.id);
      const eventMap = new Map<string, SeriesEvent>(typedEvents.map((e) => [e.id, e]));

      const { data: moments } = await supabase
        .from("moments")
        .select("id, media_url, media_type, thumbnail_url, youtube_video_id, text_content, event_id, moment_metadata(quality_score)")
        .in("event_id", eventIds)
        .in("status", ["approved", "published"])
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!moments) { setSeriesMoments([]); return; }

      type MomentRow = {
        id: string;
        media_url: string | null;
        media_type: string | null;
        thumbnail_url: string | null;
        youtube_video_id: string | null;
        text_content: string | null;
        event_id: string;
        moment_metadata: { quality_score: number | null }[] | { quality_score: number | null } | null;
      };
      const typedMoments = moments as MomentRow[];
      const mapped: SeriesMoment[] = typedMoments.map((m) => {
        const event = eventMap.get(m.event_id);
        const metadata = Array.isArray(m.moment_metadata) ? m.moment_metadata[0] : m.moment_metadata;
        return {
          id: m.id,
          media_url: m.media_url,
          media_type: m.media_type as SeriesMoment["media_type"],
          thumbnail_url: m.thumbnail_url,
          youtube_video_id: m.youtube_video_id,
          text_content: m.text_content,
          event_slug: event?.slug || "",
          event_title: event?.title || "",
          event_date: event?.starts_at || "",
          quality_score: metadata?.quality_score ?? null,
        };
      });
      setSeriesMoments(mapped);
    } catch (error) {
      console.error("Failed to fetch series moments:", error);
    } finally {
      setIsLoadingMoments(false);
    }
  }, [seriesId]);

  const handleOpenPicker = () => {
    setShowPicker(true);
    setSelectedMomentIds(new Set());
    if (seriesId) fetchSeriesMoments();
  };

  const handleOpenVibeCurator = () => {
    setShowVibeCurator(true);
    setSelectedVibeMomentIds(new Set(vibeMomentIds ?? []));
    fetchSeriesMoments();
  };

  const handleSaveVibePicks = async () => {
    if (!eventSlug) return;
    setIsSavingVibes(true);
    try {
      const response = await fetch(`/api/events/${eventSlug}/vibe-picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moment_ids: Array.from(selectedVibeMomentIds) }),
      });
      if (response.ok) {
        setShowVibeCurator(false);
        router.refresh();
      } else {
        console.error("Failed to save vibe picks:", await response.text());
      }
    } catch (error) {
      console.error("Failed to save vibe picks:", error);
    } finally {
      setIsSavingVibes(false);
    }
  };

  const toggleVibeMomentSelection = (momentId: string) => {
    setSelectedVibeMomentIds((prev) => {
      const next = new Set(prev);
      if (next.has(momentId)) {
        next.delete(momentId);
      } else if (next.size < 6) {
        next.add(momentId);
      }
      return next;
    });
  };

  const toggleMomentSelection = (momentId: string) => {
    setSelectedMomentIds((prev) => {
      const next = new Set(prev);
      if (next.has(momentId)) next.delete(momentId);
      else next.add(momentId);
      return next;
    });
  };

  const handleImportMoments = async () => {
    if (selectedMomentIds.size === 0 || !eventSlug) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: updateScope, moment_ids: Array.from(selectedMomentIds) }),
      });
      if (response.ok) { setShowPicker(false); fetchPromo(); }
    } catch (error) {
      console.error("Failed to import moments:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePromo = async (promoId: string) => {
    if (!eventSlug) return;
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo?id=${promoId}`, { method: "DELETE" });
      if (response.ok) fetchPromo();
    } catch (error) {
      console.error("Failed to delete promo:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !eventSlug) return;
    setIsUploading(true);
    try {
      const mediaItems: Array<{ media_type: string; media_url: string }> = [];
      for (const file of Array.from(files)) {
        const result = await uploadFile("promo-media", file);
        const mediaType = file.type.startsWith("video/")
          ? "video"
          : file.type === "application/pdf"
            ? "pdf"
            : "image";
        mediaItems.push({ media_type: mediaType, media_url: result.publicUrl });
      }
      await fetch(`/api/events/${eventSlug}/promo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "this_event", media_items: mediaItems }),
      });
      fetchPromo();
    } catch (error) {
      console.error("Failed to upload promo:", error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const momentsByEvent = seriesMoments.reduce((acc, moment) => {
    const key = moment.event_slug;
    if (!acc[key]) acc[key] = { title: moment.event_title, date: moment.event_date, moments: [] };
    acc[key].moments.push(moment);
    return acc;
  }, {} as Record<string, { title: string; date: string; moments: SeriesMoment[] }>);

  // Nothing to show to non-owners
  if (!isOwner && promo.length === 0 && pastMoments.length === 0) return null;

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const goNext = () => setLightboxIndex((i) => (i !== null && i < promo.length - 1 ? i + 1 : i));
  const goPrev = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));

  const sourceEvent = pastMoments[0];

  return (
    <section className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── Promotional media ── */}
      {promo.length > 0 && (
        <div className="space-y-3">
          {/* Owner management bar */}
          {isOwner && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {promoSource === "series" && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {t("usingSeriesPromo")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {canManageInline && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-8 px-2 text-muted-foreground"
                  >
                    {isUploading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
                    {isUploading ? t("uploading") : t("uploadNew")}
                  </Button>
                )}
                {canImportFromSeries && (
                  <Button variant="ghost" size="sm" onClick={handleOpenPicker} className="h-8 px-2 text-muted-foreground">
                    <Images className="w-3.5 h-3.5 mr-1" />
                    {t("importFromMoments")}
                  </Button>
                )}
                {!canManageInline && onEditClick && (
                  <Button variant="ghost" size="sm" onClick={onEditClick} className="h-8 px-2 text-muted-foreground">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    {t("editPromo")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Promo grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {promo.slice(0, 8).map((item, index) => (
              <PromoThumbnail
                key={item.id}
                item={item}
                onClick={() => openLightbox(index)}
                canDelete={canManageInline}
                onDelete={() => handleDeletePromo(item.id)}
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
                <button onClick={closeLightbox} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                  <X className="w-5 h-5" />
                </button>
                {lightboxIndex !== null && lightboxIndex > 0 && (
                  <button onClick={goPrev} className="absolute left-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}
                {lightboxIndex !== null && lightboxIndex < promo.length - 1 && (
                  <button onClick={goNext} className="absolute right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}
                {lightboxIndex !== null && <PromoLightboxContent item={promo[lightboxIndex]} />}
                {lightboxIndex !== null && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                    {lightboxIndex + 1} / {promo.length}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Owner empty state — no promo, no past moments */}
      {promo.length === 0 && isOwner && pastMoments.length === 0 && (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center">
          <Sparkles className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">{t("noPromo")}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canManageInline && (
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {isUploading ? t("uploading") : t("uploadNew")}
              </Button>
            )}
            {canImportFromSeries && (
              <Button variant="outline" size="sm" onClick={handleOpenPicker}>
                <Images className="w-4 h-4 mr-2" />
                {t("importFromMoments")}
              </Button>
            )}
            {!canManageInline && onEditClick && (
              <Button variant="outline" size="sm" onClick={onEditClick}>
                <Sparkles className="w-4 h-4 mr-2" />
                {t("addPromo")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Past moments — always shown when available ── */}
      {pastMoments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Images className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">{t("pastMomentsTitle")}</span>
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground truncate">
                {sourceEvent.event_title}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {promo.length === 0 && isOwner && canManageInline && (
                <>
                  {isSeriesEvent && !!seriesId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleOpenVibeCurator}
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      {t("curateVibes")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
                    {isUploading ? t("uploading") : t("uploadNew")}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {pastMoments.slice(0, 6).map((moment) => {
              const thumb = moment.thumbnail_url || moment.media_url;
              return (
                <Link key={moment.id} href={`/events/${moment.event_slug}/moments`}>
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted group">
                    {thumb && (
                      <img src={thumb} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
          {/* Big "See all" CTA */}
          <Link href={`/events/${sourceEvent.event_slug}/moments`}>
            <Button
              variant="outline"
              className="w-full gap-2 font-medium"
            >
              {t("seeAll")}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* Moment picker dialog */}
      {canImportFromSeries && (
        <MomentPickerDialog
          open={showPicker}
          onOpenChange={setShowPicker}
          isSeriesEvent={isSeriesEvent}
          isLoadingMoments={isLoadingMoments}
          momentsByEvent={momentsByEvent}
          selectedMomentIds={selectedMomentIds}
          toggleMomentSelection={toggleMomentSelection}
          updateScope={updateScope}
          setUpdateScope={setUpdateScope}
          isSaving={isSaving}
          onImport={handleImportMoments}
          t={t}
        />
      )}

      {/* Vibe curator dialog */}
      {isOwner && canManageInline && (
        <VibeCuratorDialog
          open={showVibeCurator}
          onOpenChange={setShowVibeCurator}
          isLoadingMoments={isLoadingMoments}
          momentsByEvent={momentsByEvent}
          selectedVibeMomentIds={selectedVibeMomentIds}
          toggleVibeMomentSelection={toggleVibeMomentSelection}
          isSaving={isSavingVibes}
          onSave={handleSaveVibePicks}
          t={t}
        />
      )}
    </section>
  );
}

function PromoThumbnail({
  item,
  onClick,
  canDelete,
  onDelete,
}: {
  item: EventPromoMedia;
  onClick: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
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
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Delete button for owners */}
      {canDelete && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
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

// Extracted dialog component for the moment picker
interface MomentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSeriesEvent: boolean;
  isLoadingMoments: boolean;
  momentsByEvent: Record<string, { title: string; date: string; moments: SeriesMoment[] }>;
  selectedMomentIds: Set<string>;
  toggleMomentSelection: (id: string) => void;
  updateScope: PromoUpdateScope;
  setUpdateScope: (scope: PromoUpdateScope) => void;
  isSaving: boolean;
  onImport: () => void;
  t: ReturnType<typeof useTranslations<"promo">>;
}

function MomentPickerDialog({
  open,
  onOpenChange,
  isSeriesEvent,
  isLoadingMoments,
  momentsByEvent,
  selectedMomentIds,
  toggleMomentSelection,
  updateScope,
  setUpdateScope,
  isSaving,
  onImport,
  t,
}: MomentPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="w-5 h-5" />
            {t("importFromMoments")}
          </DialogTitle>
        </DialogHeader>

        {isSeriesEvent && (
          <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Repeat className="w-4 h-4" />
              {t("applyTo")}
            </div>
            <RadioGroup
              value={updateScope}
              onValueChange={(v) => setUpdateScope(v as PromoUpdateScope)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="this_event" id="scope-this" />
                <Label htmlFor="scope-this" className="text-sm cursor-pointer">
                  {t("scopeThisEvent")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="future" id="scope-future" />
                <Label htmlFor="scope-future" className="text-sm cursor-pointer">
                  {t("scopeFuture")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="scope-all" />
                <Label htmlFor="scope-all" className="text-sm cursor-pointer">
                  {t("scopeAll")}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoadingMoments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(momentsByEvent).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noMomentsInSeries")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(momentsByEvent).map(([slug, { title, date, moments }]) => (
                <div key={slug} className="space-y-2">
                  <h4 className="text-sm font-medium">
                    {title}
                    <span className="text-muted-foreground font-normal ml-2">
                      {new Date(date).toLocaleDateString()}
                    </span>
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {moments.map((moment) => {
                      const isSelected = selectedMomentIds.has(moment.id);
                      return (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => toggleMomentSelection(moment.id)}
                          className={cn(
                            "aspect-square rounded-lg overflow-hidden relative group",
                            isSelected && "ring-2 ring-primary ring-offset-2"
                          )}
                        >
                          <MomentThumbnail moment={moment} />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="w-6 h-6 text-primary" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedMomentIds.size} {t("selected")}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onImport}
              disabled={selectedMomentIds.size === 0 || isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {t("import")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Vibe Curator Dialog ──────────────────────────────────────────────────────
interface VibeCuratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoadingMoments: boolean;
  momentsByEvent: Record<string, { title: string; date: string; moments: SeriesMoment[] }>;
  selectedVibeMomentIds: Set<string>;
  toggleVibeMomentSelection: (id: string) => void;
  isSaving: boolean;
  onSave: () => void;
  t: ReturnType<typeof useTranslations<"promo">>;
}

function VibeCuratorDialog({
  open,
  onOpenChange,
  isLoadingMoments,
  momentsByEvent,
  selectedVibeMomentIds,
  toggleVibeMomentSelection,
  isSaving,
  onSave,
  t,
}: VibeCuratorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="w-5 h-5" />
            {t("curateVibesTitle")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t("curateVibesHint")}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoadingMoments ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(momentsByEvent).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noMomentsInSeries")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(momentsByEvent).map(([slug, { title, date, moments }]) => (
                <div key={slug} className="space-y-2">
                  <h4 className="text-sm font-medium">
                    {title}
                    <span className="text-muted-foreground font-normal ml-2">
                      {new Date(date).toLocaleDateString()}
                    </span>
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {moments.map((moment) => {
                      const isSelected = selectedVibeMomentIds.has(moment.id);
                      const atMax = selectedVibeMomentIds.size >= 6 && !isSelected;
                      return (
                        <button
                          key={moment.id}
                          type="button"
                          onClick={() => toggleVibeMomentSelection(moment.id)}
                          disabled={atMax}
                          className={cn(
                            "aspect-square rounded-lg overflow-hidden relative group",
                            isSelected && "ring-2 ring-primary ring-offset-2",
                            atMax && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          <MomentThumbnail moment={moment} />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="w-6 h-6 text-primary" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {selectedVibeMomentIds.size}/6 {t("selected")}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {t("saveVibes")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MomentThumbnail({ moment }: { moment: SeriesMoment }) {
  const thumbnailUrl = moment.thumbnail_url || moment.media_url;
  const isVideo = moment.media_type === "video";
  const isYouTube = moment.media_type === "youtube";
  const youTubeThumbnail = moment.youtube_video_id
    ? `https://img.youtube.com/vi/${moment.youtube_video_id}/mqdefault.jpg`
    : null;

  return (
    <div className="w-full h-full bg-muted">
      {(moment.media_type === "image" || isVideo) && thumbnailUrl && (
        <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
      )}
      {isYouTube && youTubeThumbnail && (
        <img src={youTubeThumbnail} alt="" className="w-full h-full object-cover" />
      )}
      {(isVideo || isYouTube) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="w-4 h-4 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}
