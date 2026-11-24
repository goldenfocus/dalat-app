"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { loadMapLibre } from "@/components/map/load-maplibre";
import { DALAT_CENTER, MAP_STYLE_URLS } from "@/components/map/map-styles";

type Pin = { latitude: number; longitude: number };

export function EventPinPicker({ initialPin, onConfirm }: {
  initialPin: Pin | null;
  onConfirm: (pin: Pin) => void;
}) {
  const t = useTranslations("eventForm");
  const tMap = useTranslations("mapPage");
  const tCommon = useTranslations("common");
  const container = useRef<HTMLDivElement>(null);
  const initial = useRef(initialPin);
  const readyRef = useRef(false);
  const [pin, setPin] = useState(initialPin);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    const fail = () => {
      if (!cancelled && !readyRef.current) setStatus("failed");
    };
    const timer = setTimeout(fail, 15000);
    loadMapLibre().then((lib) => {
      if (cancelled || !container.current) return;
      const previous = initial.current;
      const created = new lib.Map({
        container: container.current,
        style: MAP_STYLE_URLS.light,
        center: previous ? [previous.longitude, previous.latitude] : [DALAT_CENTER.lng, DALAT_CENTER.lat],
        zoom: previous ? 17 : 14,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: false,
        renderWorldCopies: false,
      });
      map = created;
      created.touchZoomRotate.disableRotation();
      created.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      created.once("load", () => {
        if (cancelled) return;
        clearTimeout(timer);
        readyRef.current = true;
        setStatus("ready");
      });
      created.on("click", ({ lngLat }) => created.jumpTo({ center: lngLat }));
      created.on("moveend", () => {
        if (!readyRef.current || cancelled) return;
        const { lat, lng } = created.getCenter().wrap();
        setPin({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) });
      });
    }).catch(fail);

    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimeout(timer);
      map?.remove();
    };
  }, []);

  return (
    <DialogContent aria-description={t("locationPinHint")} closeLabel={tCommon("close")} className="max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
      <DialogTitle>{t("locationDropPin")}</DialogTitle>
      <DialogDescription>{t("locationPinHint")}</DialogDescription>
      <div className="relative h-[min(48dvh,24rem)] min-h-40 overflow-hidden rounded-lg bg-muted">
        <div ref={container} role="region" aria-label={t("locationDropPin")} className="absolute inset-0" />
        {status === "ready" ? (
          <MapPin aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-full fill-primary text-primary-foreground drop-shadow-md" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted px-4 text-center text-sm" role="status">
            {status === "loading" && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {status === "loading" ? t("locationLoading") : tMap("mapLoadFailed")}
          </div>
        )}
      </div>
      <Button type="button" disabled={status !== "ready" || !pin} onClick={() => pin && onConfirm(pin)}>
        {t("locationUsePin")}
      </Button>
    </DialogContent>
  );
}
