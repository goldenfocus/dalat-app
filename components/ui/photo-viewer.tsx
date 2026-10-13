"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Download, Share2, Check, X } from "lucide-react";
import { useShare } from "@/lib/hooks/use-share";

export type ViewerPhoto = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  /** Small attribution line (e.g. Google photo authors). */
  credit?: ReactNode;
  /** Set false for third-party photos we may not offer as a download. */
  downloadable?: boolean;
};

type Props = {
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Absolute URL shared for a photo (defaults to the page URL + #photo-id). */
  shareUrl?: (photo: ViewerPhoto) => string;
  shareTitle?: string;
  /** Extra per-photo actions (like, comments). */
  actions?: (photo: ViewerPhoto) => ReactNode;
};

const MAX = 4;

/**
 * Full-screen photo viewer: pinch / double-tap / wheel zoom, drag to pan when
 * zoomed, swipe or arrow keys to move between photos, download and share.
 */
export function PhotoViewer({ photos, index, onIndexChange, shareUrl, shareTitle, actions }: Props) {
  const t = useTranslations("photoViewer");
  const { share, copied } = useShare();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist?: number; scale?: number; start?: { x: number; y: number }; offset?: { x: number; y: number }; swipeX?: number; t?: number }>({});
  const lastTap = useRef(0);
  const open = index !== null && !!photos[index];
  const photo = open ? photos[index!] : null;

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);
  const go = useCallback(
    (d: number) => {
      if (index === null) return;
      const next = index + d;
      if (next < 0 || next >= photos.length) return;
      reset();
      onIndexChange(next);
    },
    [index, photos.length, onIndexChange, reset],
  );
  const close = useCallback(() => { reset(); onIndexChange(null); }, [onIndexChange, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close, go]);

  if (!open || !photo || typeof document === "undefined") return null;

  const zoomAt = (clientX: number, clientY: number, next: number) => {
    const cx = clientX - window.innerWidth / 2, cy = clientY - window.innerHeight / 2;
    const k = next / scale;
    setOffset((o) => (next <= 1 ? { x: 0, y: 0 } : { x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k }));
    setScale(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale };
    } else {
      gesture.current = { start: { x: e.clientX, y: e.clientY }, offset, swipeX: 0, t: Date.now() };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.dist) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const next = Math.min(MAX, Math.max(1, (g.scale || 1) * (d / g.dist)));
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    } else if (g.start) {
      const dx = e.clientX - g.start.x, dy = e.clientY - g.start.y;
      if (scale > 1) setOffset({ x: (g.offset?.x || 0) + dx, y: (g.offset?.y || 0) + dy });
      else g.swipeX = dx;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    if (scale === 1 && g.swipeX && Math.abs(g.swipeX) > 60) go(g.swipeX < 0 ? 1 : -1);
    else if (g.start && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < 8 && Date.now() - (g.t || 0) < 300) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        zoomAt(e.clientX, e.clientY, scale > 1 ? 1 : 2.5);
        lastTap.current = 0;
      } else lastTap.current = now;
    }
    gesture.current = {};
  };
  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, Math.min(MAX, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };

  const url = shareUrl ? shareUrl(photo) : `${window.location.origin}${window.location.pathname}#photo-${photo.id}`;
  const btn = "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 active:scale-95 transition";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={photo.alt} className="fixed inset-0 z-50 flex flex-col bg-black text-white select-none">
      <div className="flex items-center justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
        <span className="text-sm text-white/70 tabular-nums">{index! + 1} / {photos.length}</span>
        <button onClick={close} className="rounded-full p-2 hover:bg-white/10" aria-label={t("close")}>
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        className="relative flex-1 overflow-hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={photo.src}
          alt={photo.alt}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain transition-transform duration-75"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
        {index! > 0 && (
          <button onClick={() => go(-1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 sm:block" aria-label={t("previous")}>
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index! < photos.length - 1 && (
          <button onClick={() => go(1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 sm:block" aria-label={t("next")}>
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      <div className="space-y-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {photo.caption && <p className="line-clamp-3 text-sm text-white/85">{photo.caption}</p>}
        {photo.credit && <p className="text-xs text-white/60">{photo.credit}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {actions?.(photo)}
          <button className={btn} onClick={() => share({ title: shareTitle || photo.alt, url })}>
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {copied ? t("linkCopied") : t("share")}
          </button>
          {photo.downloadable !== false && (
            <a className={btn} href={photo.src} download={`dalat-app-${photo.id}.jpg`}>
              <Download className="h-4 w-4" />
              {t("download")}
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
