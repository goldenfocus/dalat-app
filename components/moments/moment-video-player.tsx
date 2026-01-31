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
  const [isReady, setIsReady] = useState(false);

  const isHlsUrl = hlsSrc?.includes(".m3u8");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // No HLS URL - use direct MP4
    if (!hlsSrc || !isHlsUrl) {
      video.src = src;
      setIsReady(true);
      return;
    }

    // Safari can play HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      setUseNativeHls(true);
      video.src = hlsSrc;
      setIsReady(true);
      return;
    }

    // Use HLS.js for other browsers (Chrome, Firefox, etc.)
    let mounted = true;

    import("hls.js").then(({ default: Hls }) => {
      if (!mounted || !videoRef.current) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode: false,
          startLevel: -1, // Auto quality selection
          backBufferLength: 60,
        });

        hlsRef.current = hls;
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);

        // HLS.js needs manifest parsed before video can play
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsReady(true);
          // Autoplay - muted to comply with browser autoplay policies
          video.muted = true;
          video.play().catch(() => {
            // Autoplay blocked - user will need to click play
            console.log("[MomentVideoPlayer] Autoplay blocked");
          });
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error("[MomentVideoPlayer] HLS error, falling back to MP4:", data);
            // Try to recover first
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            } else {
              // Can't recover - fallback to MP4
              hls.destroy();
              hlsRef.current = null;
              if (videoRef.current) {
                videoRef.current.src = src;
                setIsReady(true);
              }
            }
          }
        });
      } else {
        // HLS.js not supported, use direct MP4
        video.src = src;
        setIsReady(true);
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

  return (
    <video
      ref={videoRef}
      poster={poster || undefined}
      className="w-full h-full object-contain"
      controls
      muted // Required for autoplay
      playsInline
      // Only set autoPlay for non-HLS (HLS.js handles play after manifest parse)
      autoPlay={!isHlsUrl || useNativeHls}
    />
  );
}
