"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Images,
  Wand2,
  X,
  Check,
  Loader2,
  Repeat,
  Play,
  FileText,
  Upload,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage/client";
import {
  fetchPublishedSeriesMoments,
  type PublishedSeriesMoment as SeriesMoment,
} from "@/lib/events/published-series-moments";
import type { EventPromoMedia, PromoUpdateScope } from "@/lib/types";

interface PromoManagerProps {
  eventId: string;
  eventSlug: string;
  seriesId?: string | null;
  isSeriesEvent: boolean;
}

export function PromoManager({
  eventId,
  eventSlug,
  seriesId,
  isSeriesEvent,
}: PromoManagerProps) {
  const t = useTranslations("promo");
  const locale = useLocale();

  const [promoItems, setPromoItems] = useState<EventPromoMedia[]>([]);
  const [promoSource, setPromoSource] = useState<"event" | "series" | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [seriesMoments, setSeriesMoments] = useState<SeriesMoment[]>([]);
  const [selectedMomentIds, setSelectedMomentIds] = useState<Set<string>>(new Set());
  const [isLoadingMoments, setIsLoadingMoments] = useState(false);
  const [momentsLoadError, setMomentsLoadError] = useState(false);
  const [updateScope, setUpdateScope] = useState<PromoUpdateScope>("this_event");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPromo = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo`);
      if (response.ok) {
        const data = await response.json();
        setPromoItems(data.promo || []);
        setPromoSource(data.promo?.[0]?.promo_source);
      }
    } catch (error) {
      console.error("Failed to fetch promo:", error);
    } finally {
      setIsLoading(false);
    }
  }, [eventSlug]);

  useEffect(() => { fetchPromo(); }, [fetchPromo]);

  const fetchSeriesMoments = useCallback(async () => {
    if (!seriesId) return;
    setIsLoadingMoments(true);
    setMomentsLoadError(false);
    try {
      setSeriesMoments(await fetchPublishedSeriesMoments({
        seriesId,
        currentEventId: eventId,
      }));
    } catch (error) {
      setSeriesMoments([]);
      setMomentsLoadError(true);
      console.error("Failed to fetch series moments:", error);
    } finally {
      setIsLoadingMoments(false);
    }
  }, [eventId, seriesId]);

  const handleOpenPicker = () => {
    setShowPicker(true);
    setSelectedMomentIds(new Set());
    if (seriesId) fetchSeriesMoments();
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
    if (selectedMomentIds.size === 0) return;
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
    const previous = promoItems;
    setPromoItems((prev) => prev.filter((p) => p.id !== promoId));
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo?id=${promoId}`, { method: "DELETE" });
      if (!response.ok) {
        setPromoItems(previous);
        console.error("Failed to delete promo:", response.status);
      }
    } catch (error) {
      setPromoItems(previous);
      console.error("Failed to delete promo:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
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

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {promoItems.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("currentPromo")} ({promoItems.length})
              {promoSource === "series" && <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded">{t("usingSeriesPromo")}</span>}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {promoItems.map((item) => (
              <div key={item.id} className="aspect-square rounded-lg overflow-hidden relative group bg-muted">
                <PromoThumbnail item={item} />
                <button type="button" onClick={() => handleDeletePromo(item.id)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t("noPromo")}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {isUploading ? t("uploading") : t("uploadNew")}
        </Button>
        {isSeriesEvent && seriesId && (
          <Button type="button" variant="outline" size="sm" onClick={handleOpenPicker}>
            <Images className="w-4 h-4 mr-2" />{t("importFromMoments")}
          </Button>
        )}
      </div>

      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Images className="w-5 h-5" />{t("importFromMoments")}</DialogTitle>
          </DialogHeader>
          {isSeriesEvent && (
            <div className="p-3 bg-muted/50 rounded-lg border space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Repeat className="w-4 h-4" />{t("applyTo")}</div>
              <RadioGroup value={updateScope} onValueChange={(v) => setUpdateScope(v as PromoUpdateScope)} className="space-y-2">
                <div className="flex items-center gap-2"><RadioGroupItem value="this_event" id="scope-this" /><Label htmlFor="scope-this" className="text-sm cursor-pointer">{t("scopeThisEvent")}</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="future" id="scope-future" /><Label htmlFor="scope-future" className="text-sm cursor-pointer">{t("scopeFuture")}</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="all" id="scope-all" /><Label htmlFor="scope-all" className="text-sm cursor-pointer">{t("scopeAll")}</Label></div>
              </RadioGroup>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {isLoadingMoments ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : momentsLoadError ? (
              <div className="text-center py-12 text-destructive" role="alert"><p>{t("loadMomentsError")}</p></div>
            ) : Object.keys(momentsByEvent).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><p>{t("noMomentsInSeries")}</p></div>
            ) : (
              <div className="space-y-6">
                {Object.entries(momentsByEvent).map(([slug, { title, date, moments }]) => (
                  <div key={slug} className="space-y-2">
                    <h4 className="text-sm font-medium">{title}<span className="text-muted-foreground font-normal ml-2">{new Date(date).toLocaleDateString(locale)}</span></h4>
                    <div className="grid grid-cols-4 gap-2">
                      {moments.map((moment) => {
                        const isSelected = selectedMomentIds.has(moment.id);
                        return (
                          <button key={moment.id} type="button" onClick={() => toggleMomentSelection(moment.id)} className={cn("aspect-square rounded-lg overflow-hidden relative group", isSelected && "ring-2 ring-primary ring-offset-2")}>
                            <MomentThumbnail moment={moment} />
                            {isSelected && <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"><Check className="w-6 h-6 text-primary" /></div>}
                            {moment.quality_score && moment.quality_score >= 80 && <div className="absolute top-1 left-1 p-1 rounded bg-amber-500/90"><Wand2 className="w-3 h-3 text-white" /></div>}
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
            <p className="text-sm text-muted-foreground">{selectedMomentIds.size} {t("selected")}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowPicker(false)}>{t("cancel")}</Button>
              <Button type="button" onClick={handleImportMoments} disabled={selectedMomentIds.size === 0 || isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}{t("import")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromoThumbnail({ item }: { item: EventPromoMedia }) {
  const thumbnailUrl = item.thumbnail_url || item.media_url;
  const isVideo = item.media_type === "video";
  const isYouTube = item.media_type === "youtube";
  const isPdf = item.media_type === "pdf";
  const isSoundCloud = item.media_type === "soundcloud";
  const youTubeThumbnail = item.youtube_video_id ? `https://img.youtube.com/vi/${item.youtube_video_id}/mqdefault.jpg` : null;

  return (
    <>
      {(item.media_type === "image" || isVideo) && thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />}
      {isYouTube && youTubeThumbnail && <img src={youTubeThumbnail} alt="" className="w-full h-full object-cover" />}
      {isPdf && <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>}
      {isSoundCloud && (item.thumbnail_url
        ? <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center"><Music className="w-6 h-6 text-muted-foreground" /></div>)}
      {(isVideo || isYouTube || isSoundCloud) && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white ml-0.5" /></div></div>}
    </>
  );
}

function MomentThumbnail({ moment }: { moment: SeriesMoment }) {
  const thumbnailUrl = moment.thumbnail_url || moment.media_url;
  const isVideo = moment.media_type === "video";
  const isYouTube = moment.media_type === "youtube";
  const youTubeThumbnail = moment.youtube_video_id ? `https://img.youtube.com/vi/${moment.youtube_video_id}/mqdefault.jpg` : null;

  return (
    <div className="w-full h-full bg-muted">
      {(moment.media_type === "image" || isVideo) && thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />}
      {isYouTube && youTubeThumbnail && <img src={youTubeThumbnail} alt="" className="w-full h-full object-cover" />}
      {(isVideo || isYouTube) && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white ml-0.5" /></div></div>}
    </div>
  );
}
