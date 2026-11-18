"use client";
import { useEffect, useRef } from "react";
type Player = { destroy(): void };
type YouTubeApi = { Player: new (element: HTMLElement, options: {events: {onStateChange(event: {data: number}): void}}) => Player };
type VideoWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiReady: Promise<YouTubeApi> | undefined;
function loadApi(): Promise<YouTubeApi> {
  const host = window as VideoWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (!apiReady) apiReady = new Promise((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    host.onYouTubeIframeAPIReady = () => { previous?.(); if (host.YT) resolve(host.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => { apiReady = undefined; reject(new Error("YouTube player unavailable")); };
      document.head.appendChild(script);
    }
  });
  return apiReady;
}
export function PromoYouTubePlayer({ videoId, title, onEnded }: {videoId: string; title: string; onEnded: () => void}) {
  const ref = useRef<HTMLDivElement>(null); const end = useRef(onEnded); end.current = onEnded;
  useEffect(() => {
    let cancelled = false; let player: Player | undefined;
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`;
    iframe.title = title; iframe.className = "h-full w-full";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true; iframe.referrerPolicy = "strict-origin-when-cross-origin";
    ref.current?.appendChild(iframe);
    loadApi().then(api => { if (!cancelled) player = new api.Player(iframe, {events: {onStateChange: event => {if(event.data === 0) end.current();}}}); }).catch(() => {});
    return () => {cancelled = true; player?.destroy(); iframe.remove();};
  }, [videoId, title]);
  return <div ref={ref} className="h-full w-full" />;
}
