"use client";

import { useRef, useEffect, useState } from "react";

interface MomentVideoPlayerProps {
  /** Original video URL (Supabase Storage) - fallback */
  src: string;
  /** Cloudflare Stream HLS URL - preferred for adaptive streaming */
  hlsSrc?: string | null;
  /** Thumbnail/poster image */
  poster?: string | null;
}

/**
 * Video player for moment detail pages with HLS support.
 *
 * Uses Cloudflare Stream's adaptive bitrate streaming when available:
 * - Safari: Native HLS support
 * - Chrome/Firefox: HLS.js for adaptive streaming
 * - Fallback: Direct MP4 from Supabase Storage
 */
export function MomentVideoPlayer({ src, hlsSrc, poster }: MomentVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<InstanceType<typeof import("hls.js").default> | null>(null);
  const [useNativeHls, setUseNativeHls] = useState(false);

  const isHlsUrl = hlsSrc?.includes(".m3u8");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsSrc || !isHlsUrl) return;

    // Safari can play HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      setUseNativeHls(true);
      video.src = hlsSrc;
      return;
    }

    // Use HLS.js for other browsers
    let mounted = true;

    import("hls.js").then(({ default: Hls }) => {
      if (!mounted || !videoRef.current) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: false,
          startLevel: -1, // Auto quality selection
        });

        hlsRef.current = hls;
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error("[MomentVideoPlayer] HLS error, falling back to MP4:", data);
            hls.destroy();
            hlsRef.current = null;
            // Fallback to direct MP4
            if (videoRef.current) {
              videoRef.current.src = src;
            }
          }
        });
      } else {
        // HLS.js not supported, use direct MP4
        video.src = src;
      }
    });

    return () => {
      mounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsSrc, isHlsUrl, src]);

  // Determine the src for the video element
  // - If using native HLS (Safari) or HLS.js, don't set src (handled in useEffect)
  // - If no HLS URL, use the direct MP4 src
  const videoSrc = !hlsSrc || !isHlsUrl ? src : (useNativeHls ? hlsSrc : undefined);

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      poster={poster || undefined}
      className="w-full h-full object-contain"
      controls
      autoPlay
      playsInline
    />
  );
}
