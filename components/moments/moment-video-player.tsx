"use client";

import { useRef, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

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
  const [isMuted, setIsMuted] = useState(true);

  const isHlsUrl = hlsSrc?.includes(".m3u8");

  // Toggle mute state
  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  // Sync muted state when video changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVolumeChange = () => {
      setIsMuted(video.muted);
    };

    video.addEventListener("volumechange", handleVolumeChange);
    return () => video.removeEventListener("volumechange", handleVolumeChange);
  }, []);

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
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <video
        ref={videoRef}
        poster={poster || undefined}
        className="w-full h-full max-h-[90vh] object-contain"
        controls
        muted // Required for autoplay
        playsInline
        // Only set autoPlay for non-HLS (HLS.js handles play after manifest parse)
        autoPlay={!isHlsUrl || useNativeHls}
      />
      {/* Prominent unmute button */}
      {isMuted && (
        <button
          type="button"
          onClick={handleToggleMute}
          className="absolute top-4 right-4 p-3 rounded-full bg-black/70 text-white hover:bg-black/90 active:scale-95 transition-all z-10"
          aria-label="Unmute"
        >
          <VolumeX className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
