"use client";

import { memo, useEffect, useRef, useState, useMemo } from "react";
import { Music, Mic2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioPlayerStore } from "@/lib/stores/audio-player-store";
import { createClient } from "@/lib/supabase/client";

/**
 * Floating music note that drifts across the screen
 */
function FloatingNote({ delay, duration, startX }: { delay: number; duration: number; startX: number }) {
  const notes = ["♪", "♫", "♬", "🎵", "🎶"];
  const note = useMemo(() => notes[Math.floor(Math.random() * notes.length)], []);

  return (
    <div
      className="absolute text-2xl text-white/20 animate-float pointer-events-none select-none"
      style={{
        left: `${startX}%`,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    >
      {note}
    </div>
  );
}

/**
 * Countdown display before lyrics start
 */
export const KaraokeCountdown = memo(function KaraokeCountdown({
  secondsUntilFirst,
  isPlaying,
}: {
  secondsUntilFirst: number;
  isPlaying: boolean;
}) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showGetReady, setShowGetReady] = useState(false);

  useEffect(() => {
    if (!isPlaying || secondsUntilFirst <= 0) {
      setCountdown(null);
      setShowGetReady(false);
      return;
    }

    // Show "Get Ready" when 5+ seconds away
    if (secondsUntilFirst > 4) {
      setShowGetReady(true);
      setCountdown(null);
    }
    // Show countdown 3, 2, 1
    else if (secondsUntilFirst > 0 && secondsUntilFirst <= 4) {
      setShowGetReady(false);
      setCountdown(Math.ceil(secondsUntilFirst));
    }
  }, [secondsUntilFirst, isPlaying]);

  if (!isPlaying) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 animate-pulse">
        <Mic2 className="w-16 h-16 text-primary/50" />
        <p className="text-xl text-white/50">Press play to start</p>
      </div>
    );
  }

  if (showGetReady) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 animate-in zoom-in duration-500">
        <div className="relative">
          <Mic2 className="w-20 h-20 text-primary animate-bounce" />
          <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-yellow-400 animate-pulse" />
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-white mb-2">Get Ready!</p>
          <p className="text-lg text-white/60">🎤 Lyrics starting soon...</p>
        </div>
      </div>
    );
  }

  if (countdown !== null && countdown > 0) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div
          key={countdown}
          className="text-9xl font-black text-primary animate-in zoom-in-50 duration-300"
          style={{
            textShadow: "0 0 40px hsl(var(--primary) / 0.5), 0 0 80px hsl(var(--primary) / 0.3)",
          }}
        >
          {countdown}
        </div>
        <p className="text-xl text-white/60 mt-4 animate-pulse">
          {countdown === 1 ? "🎤 SING!" : "..."}
        </p>
      </div>
    );
  }

  return null;
});

/**
 * Instrumental break indicator
 */
export const InstrumentalBreak = memo(function InstrumentalBreak({
  nextLyricPreview,
}: {
  nextLyricPreview?: string | null;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 text-4xl text-white/30 animate-pulse">
        <span>♪</span>
        <span className="delay-100">♫</span>
        <span className="delay-200">♪</span>
      </div>
      <p className="text-lg text-white/40 italic">Instrumental...</p>
      {nextLyricPreview && (
        <p className="text-xl text-white/20 mt-8 max-w-md text-center">
          Coming up: "{nextLyricPreview.slice(0, 50)}..."
        </p>
      )}
    </div>
  );
});

/**
 * Floating music notes background
 */
export const FloatingNotes = memo(function FloatingNotes({ count = 8 }: { count?: number }) {
  const notes = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      delay: Math.random() * 5,
      duration: 8 + Math.random() * 4,
      startX: Math.random() * 100,
    })),
    [count]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {notes.map((note) => (
        <FloatingNote key={note.id} {...note} />
      ))}
    </div>
  );
});

/**
 * Audio-reactive pulse background
 */
export const PulseBackground = memo(function PulseBackground({
  isPlaying,
  intensity = 1,
}: {
  isPlaying: boolean;
  intensity?: number;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none transition-opacity duration-1000",
        isPlaying ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Center glow that pulses */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
        style={{
          background: `radial-gradient(circle, hsl(var(--primary) / ${0.1 * intensity}) 0%, transparent 70%)`,
          animation: isPlaying ? "pulse-glow 2s ease-in-out infinite" : "none",
        }}
      />

      {/* Side gradients */}
      <div
        className="absolute inset-y-0 left-0 w-1/4"
        style={{
          background: "linear-gradient(to right, hsl(var(--primary) / 0.05), transparent)",
          animation: isPlaying ? "shimmer-left 3s ease-in-out infinite" : "none",
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/4"
        style={{
          background: "linear-gradient(to left, hsl(280 100% 50% / 0.05), transparent)",
          animation: isPlaying ? "shimmer-right 3s ease-in-out infinite" : "none",
        }}
      />
    </div>
  );
});

/**
 * Sparkle effect on word highlight
 */
export const WordSparkle = memo(function WordSparkle() {
  return (
    <span className="absolute -top-1 -right-1 animate-ping">
      <Sparkles className="w-3 h-3 text-yellow-400" />
    </span>
  );
});

/**
 * Background slideshow for karaoke — crossfades between event images with heavy blur
 */
export const KaraokeBackgroundSlideshow = memo(function KaraokeBackgroundSlideshow() {
  const playlist = useAudioPlayerStore((s) => s.playlist);
  const tracks = useAudioPlayerStore((s) => s.tracks);

  const [images, setImages] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showFirst, setShowFirst] = useState(true);
  const hasFetched = useRef(false);

  // Collect images from store (event flyer + track thumbnails)
  const storeImages = useMemo(() => {
    const urls: string[] = [];
    if (playlist?.eventImageUrl) urls.push(playlist.eventImageUrl);
    for (const t of tracks) {
      if (t.thumbnail_url && !urls.includes(t.thumbnail_url)) {
        urls.push(t.thumbnail_url);
      }
    }
    return urls;
  }, [playlist?.eventImageUrl, tracks]);

  // Lazily fetch event moment thumbnails for richer backgrounds
  useEffect(() => {
    if (hasFetched.current || !playlist?.eventId) {
      setImages(storeImages);
      return;
    }
    hasFetched.current = true;

    const fetchMoments = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("moments")
          .select("thumbnail_url")
          .eq("event_id", playlist.eventId!)
          .not("thumbnail_url", "is", null)
          .order("quality_score", { ascending: false })
          .limit(8);

        const momentUrls = (data ?? [])
          .map((m: { thumbnail_url: string | null }) => m.thumbnail_url as string)
          .filter((url: string) => !storeImages.includes(url));

        setImages([...storeImages, ...momentUrls]);
      } catch {
        setImages(storeImages);
      }
    };
    fetchMoments();
  }, [playlist?.eventId, storeImages]);

  // Cycle through images with crossfade
  useEffect(() => {
    if (images.length <= 1) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
      setShowFirst((prev) => !prev);
    }, 12000);

    return () => clearInterval(interval);
  }, [images.length]);

  if (images.length === 0) return null;

  const currentUrl = images[activeIndex];
  const nextUrl = images[(activeIndex + 1) % images.length];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Layer A */}
      <img
        src={showFirst ? currentUrl : nextUrl}
        alt=""
        className={cn(
          "absolute inset-0 w-full h-full object-cover scale-110 blur-3xl transition-opacity duration-[3000ms]",
          showFirst ? "opacity-[0.12]" : "opacity-0"
        )}
      />
      {/* Layer B */}
      <img
        src={showFirst ? nextUrl : currentUrl}
        alt=""
        className={cn(
          "absolute inset-0 w-full h-full object-cover scale-110 blur-3xl transition-opacity duration-[3000ms]",
          showFirst ? "opacity-0" : "opacity-[0.12]"
        )}
      />
    </div>
  );
});

/**
 * CSS for animations (inject once)
 */
export function KaraokeStyles() {
  return (
    <style jsx global>{`
      @keyframes float {
        0% {
          transform: translateY(100vh) rotate(0deg);
          opacity: 0;
        }
        10% {
          opacity: 0.3;
        }
        90% {
          opacity: 0.3;
        }
        100% {
          transform: translateY(-100px) rotate(360deg);
          opacity: 0;
        }
      }

      .animate-float {
        animation: float linear infinite;
      }

      @keyframes pulse-glow {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.5;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.1);
          opacity: 0.8;
        }
      }

      @keyframes shimmer-left {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 0.6; }
      }

      @keyframes shimmer-right {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 0.3; }
      }

      @keyframes word-glow {
        0%, 100% {
          text-shadow: 0 0 10px hsl(var(--primary) / 0.5);
        }
        50% {
          text-shadow: 0 0 20px hsl(var(--primary) / 0.8), 0 0 40px hsl(var(--primary) / 0.4);
        }
      }

      .animate-word-glow {
        animation: word-glow 0.5s ease-in-out;
      }
    `}</style>
  );
}
