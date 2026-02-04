"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventPromoMedia, PromoUpdateScope } from "@/lib/types";

interface PromoManagerProps {
  eventId: string;
  eventSlug: string;
  seriesId?: string | null;
  isSeriesEvent: boolean;
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

interface MomentRow {
  id: string;
  media_url: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  text_content: string | null;
  event_id: string;
  moment_metadata: { quality_score: number | null }[] | { quality_score: number | null } | null;
}

export function PromoManager({
  eventId: _eventId,
  eventSlug,
  seriesId,
  isSeriesEvent,
}: PromoManagerProps) {
  const t = useTranslations("promo");

  const [promoItems, setPromoItems] = useState<EventPromoMedia[]>([]);
  const [promoSource, setPromoSource] = useState<"event" | "series" | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [seriesMoments, setSeriesMoments] = useState<SeriesMoment[]>([]);
  const [selectedMomentIds, setSelectedMomentIds] = useState<Set<string>>(new Set());
  const [isLoadingMoments, setIsLoadingMoments] = useState(false);
  const [updateScope, setUpdateScope] = useState<PromoUpdateScope>("this_event");
  const [isSaving, setIsSaving] = useState(false);

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
        .eq("status", "approved")
        .not("media_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!moments) { setSeriesMoments([]); return; }

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
    try {
      const response = await fetch(`/api/events/${eventSlug}/promo?id=${promoId}`, { method: "DELETE" });
      if (response.ok) fetchPromo();
    } catch (error) {
      console.error("Failed to delete promo:", error);
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
                <button onClick={() => handleDeletePromo(item.id)} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
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

      <div className="flex flex-wrap gap-2">
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
            ) : Object.keys(momentsByEvent).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><p>{t("noMomentsInSeries")}</p></div>
            ) : (
              <div className="space-y-6">
                {Object.entries(momentsByEvent).map(([slug, { title, date, moments }]) => (
                  <div key={slug} className="space-y-2">
                    <h4 className="text-sm font-medium">{title}<span className="text-muted-foreground font-normal ml-2">{new Date(date).toLocaleDateString()}</span></h4>
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
  const youTubeThumbnail = item.youtube_video_id ? `https://img.youtube.com/vi/${item.youtube_video_id}/mqdefault.jpg` : null;

  return (
    <>
      {(item.media_type === "image" || isVideo) && thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />}
      {isYouTube && youTubeThumbnail && <img src={youTubeThumbnail} alt="" className="w-full h-full object-cover" />}
      {isPdf && <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>}
      {(isVideo || isYouTube) && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-4 h-4 text-white fill-white ml-0.5" /></div></div>}
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
