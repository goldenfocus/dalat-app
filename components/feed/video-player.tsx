"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useIntersectionVideo } from "@/lib/hooks/use-intersection-video";
import { triggerHaptic } from "@/lib/haptics";

interface VideoPlayerProps {
  src: string;
  /** Optional HLS URL for adaptive streaming (Cloudflare Stream) */
  hlsSrc?: string | null;
  isActive: boolean;
  poster?: string;
  /** Controlled mute state from parent */
  isMuted: boolean;
  /** Callback to toggle mute state */
  onMuteToggle: () => void;
}

/**
 * Check if URL is a Cloudflare Stream HLS URL
 */
function isHlsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("cloudflarestream.com") && url.includes(".m3u8");
}

/**
 * Autoplay video component for the feed.
 * Supports both direct MP4 and HLS adaptive streaming.
 *
 * For HLS (Cloudflare Stream):
 * - Safari uses native HLS support
 * - Chrome/Firefox use HLS.js for adaptive bitrate streaming
 *
 * Plays when visible and active, pauses when scrolled away.
 * Tap anywhere to toggle mute/unmute with center feedback.
 * Mute state is controlled by parent (engagement bar has the visible toggle).
 */
export function VideoPlayer({
  src,
  hlsSrc,
  isActive,
  poster,
  isMuted,
  onMuteToggle,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<InstanceType<typeof import("hls.js").default> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);

  // Determine which source to use
  const effectiveSrc = hlsSrc || src;
  const useHls = isHlsUrl(hlsSrc);

  useIntersectionVideo(videoRef, isActive);

  // Setup HLS.js when needed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !useHls || !hlsSrc) return;

    let mounted = true;

    // Safari can play HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsSrc;
      return;
    }

    // Use HLS.js for other browsers
    import("hls.js").then(({ default: Hls }) => {
      if (!mounted || !videoRef.current) return;

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Optimize for VOD, not live
          lowLatencyMode: false,
          // Keep some buffer for smooth playback
          backBufferLength: 60,
          // Start with lower quality for faster initial load
          startLevel: -1, // Auto
          // Enable quality switching
          abrEwmaDefaultEstimate: 500000, // 500kbps initial estimate
        });

        hlsRef.current = hls;
        hls.loadSource(hlsSrc);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.muted = isMuted;
          if (isActive) {
            video.play().catch(() => {});
          }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            console.error("[VideoPlayer] HLS fatal error:", data);
            // Try to recover or fallback to MP4
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
            }
          }
        });
      }
    });

    return () => {
      mounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [hlsSrc, useHls, isMuted, isActive]);

  // Sync muted prop with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Reset loading and hint state when video source changes
  useEffect(() => {
    setIsLoading(true);
    setShowHint(true);
  }, [effectiveSrc]);

  // Auto-hide hint after 3 seconds
  useEffect(() => {
    if (!showHint || !isActive) return;
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, [showHint, isActive]);

  const handleTap = useCallback(() => {
    setShowHint(false);
    triggerHaptic("selection");
    onMuteToggle();

    // Show brief center feedback
    setShowFeedback(true);
    setTimeout(() => setShowFeedback(false), 600);
  }, [onMuteToggle]);

  const handleLoadedData = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="absolute inset-0 z-10" onClick={handleTap}>
      {/* Loading skeleton */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900 animate-pulse z-0" />
      )}

      <video
        ref={videoRef}
        // Only set src directly for non-HLS (HLS.js manages src)
        src={useHls ? undefined : src}
        poster={poster}
        className="absolute inset-0 w-full h-full object-contain"
        muted={isMuted}
        loop
        playsInline
        preload={isActive ? "auto" : "metadata"}
        onLoadedData={handleLoadedData}
      />

      {/* Center feedback on tap */}
      {showFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="p-4 rounded-full bg-black/60 animate-in zoom-in-50 fade-in duration-150">
            {isMuted ? (
              <VolumeX className="w-10 h-10 text-white" />
            ) : (
              <Volume2 className="w-10 h-10 text-white" />
            )}
          </div>
        </div>
      )}

      {/* "Tap to unmute" hint - shows briefly on first view */}
      {isMuted && showHint && isActive && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
            <VolumeX className="w-5 h-5 text-white" />
            <span className="text-white text-sm font-medium">Tap for sound</span>
          </div>
        </div>
      )}
    </div>
  );
}
