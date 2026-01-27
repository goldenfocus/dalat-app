"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { Sparkles, PartyPopper, Users, Volume2, VolumeX } from "lucide-react";
import { ShareButtons } from "./share-buttons";

// Storage key for mute preference
const CELEBRATION_MUTE_KEY = "dalat-celebration-muted";

interface RsvpCelebrationProps {
  eventUrl: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  imageUrl?: string | null;
  onComplete: () => void;
  /** Duration of celebration in ms (default 5000) */
  duration?: number;
  /** Enable fireworks sound effect */
  enableSound?: boolean;
}

export function RsvpCelebration({
  eventUrl,
  eventTitle,
  eventDescription,
  startsAt,
  imageUrl,
  onComplete,
  duration = 5000,
  enableSound = true,
}: RsvpCelebrationProps) {
  const t = useTranslations("rsvpCelebration");
  const [currentPhrase, setCurrentPhrase] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(CELEBRATION_MUTE_KEY) === "true";
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const confettiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  // Get celebration phrases from translations
  const getPhrases = useCallback(() => {
    try {
      return t.raw("phrases") as string[];
    } catch {
      // Fallback phrases if translations not loaded
      return [
        "You're making Da Lat more fun!",
        "Thanks for being part of the community!",
        "See you there!",
      ];
    }
  }, [t]);

  // Get a random phrase
  const getRandomPhrase = useCallback(() => {
    const phrases = getPhrases();
    return phrases[Math.floor(Math.random() * phrases.length)];
  }, [getPhrases]);

  // Fire confetti when card pops up
  const fireCardConfetti = useCallback(() => {
    const colors = [
      "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff",
      "#ff9f43", "#a855f7", "#ec4899", "#14b8a6"
    ];

    // Burst from left side
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.65 },
      colors,
      startVelocity: 45,
      gravity: 1,
      ticks: 120,
      zIndex: 10001,
    });

    // Burst from right side
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.65 },
      colors,
      startVelocity: 45,
      gravity: 1,
      ticks: 120,
      zIndex: 10001,
    });

    // Rain from top center
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 120,
        origin: { x: 0.5, y: 0 },
        colors,
        startVelocity: 30,
        gravity: 0.8,
        ticks: 150,
        shapes: ["circle", "square"],
        zIndex: 10001,
      });
    }, 150);
  }, []);

  // Fire fireworks effect
  const fireFireworks = useCallback(() => {
    const colors = [
      "#ff6b6b", // coral red
      "#ffd93d", // golden yellow
      "#6bcb77", // fresh green
      "#4d96ff", // bright blue
      "#ff9f43", // orange
      "#a855f7", // purple
      "#ec4899", // pink
      "#14b8a6", // teal
    ];

    // Create multiple firework bursts from different positions
    const fireOneBurst = () => {
      const x = 0.2 + Math.random() * 0.6; // Random x between 0.2 and 0.8
      const y = 0.3 + Math.random() * 0.3; // Random y between 0.3 and 0.6

      // Main burst
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x, y },
        colors: colors.slice(0, 4),
        startVelocity: 45,
        gravity: 1.2,
        ticks: 100,
        shapes: ["circle", "square"],
        scalar: 1.1,
        zIndex: 10001,
      });

      // Secondary sparkle effect
      setTimeout(() => {
        confetti({
          particleCount: 30,
          spread: 100,
          origin: { x, y },
          colors: colors.slice(4),
          startVelocity: 25,
          gravity: 0.8,
          ticks: 60,
          shapes: ["circle"],
          scalar: 0.7,
          zIndex: 10001,
        });
      }, 100);
    };

    // Initial burst
    fireOneBurst();

    // Continue firing for dramatic effect
    let burstCount = 0;
    confettiIntervalRef.current = setInterval(() => {
      fireOneBurst();
      burstCount++;
      if (burstCount >= 4) {
        if (confettiIntervalRef.current) {
          clearInterval(confettiIntervalRef.current);
        }
      }
    }, 400);
  }, []);

  // Play celebration sound
  const playSound = useCallback((muted: boolean) => {
    if (!enableSound || muted) return;
    try {
      // Create audio element for fireworks/celebration sound
      const audio = new Audio("/sounds/celebration.mp3");
      audio.volume = 0.3;
      audioRef.current = audio;
      audio.play().catch(() => {
        // Audio playback failed - that's okay, continue silently
      });
    } catch {
      // Audio not available
    }
  }, [enableSound]);

  // Toggle mute and persist preference
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newValue = !prev;
      localStorage.setItem(CELEBRATION_MUTE_KEY, String(newValue));
      // If unmuting and audio exists, resume playback
      if (!newValue && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
      // If muting, pause audio
      if (newValue && audioRef.current) {
        audioRef.current.pause();
      }
      return newValue;
    });
  }, []);

  // Initialize celebration (runs once on mount)
  useEffect(() => {
    // Prevent double-execution in React Strict Mode
    if (initializedRef.current) return;
    initializedRef.current = true;

    setCurrentPhrase(getRandomPhrase());

    // Fire card confetti immediately when modal appears
    fireCardConfetti();

    // Fire fireworks slightly after for layered effect
    setTimeout(() => {
      fireFireworks();
    }, 200);

    // Play sound (check mute state at init time)
    const mutedAtInit = localStorage.getItem(CELEBRATION_MUTE_KEY) === "true";
    playSound(mutedAtInit);

    // Show invite section after a brief delay
    setTimeout(() => {
      setShowInvite(true);
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate effect for phrase cycling (needs getRandomPhrase dep)
  useEffect(() => {
    const phraseInterval = setInterval(() => {
      setCurrentPhrase(getRandomPhrase());
    }, 3000);

    return () => clearInterval(phraseInterval);
  }, [getRandomPhrase]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (confettiIntervalRef.current) {
        clearInterval(confettiIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    setIsVisible(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (confettiIntervalRef.current) {
      clearInterval(confettiIntervalRef.current);
    }
    setTimeout(onComplete, 300);
  }, [onComplete]);

  // Auto-close after duration (but give user time with invite section)
  useEffect(() => {
    const timeout = setTimeout(() => {
      // Only auto-close if user hasn't interacted with invite section
      // Keep it open longer so they can share
    }, duration + 5000);

    return () => clearTimeout(timeout);
  }, [duration]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "celebration-center p-4 bg-black/85 backdrop-blur-md transition-all duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={(e) => {
        // Only close if clicking the backdrop, not the content
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] rounded-full bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/20 blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] rounded-full bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 blur-3xl animate-pulse"
          style={{ animationDelay: "0.5s" }}
        />
      </div>

      {/* Content card */}
      <div
        className={cn(
          "relative max-w-sm w-full bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-3xl shadow-2xl border border-white/20 overflow-hidden transition-all duration-500",
          isVisible ? "scale-100" : "scale-95"
        )}
      >
        {/* Glowing top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500" />

        {/* Top icon */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-pink-500/40 to-purple-500/40 blur-xl rounded-full" />
            <div className="relative bg-gradient-to-br from-pink-500 to-purple-600 rounded-full p-3 shadow-lg shadow-purple-500/30">
              <PartyPopper className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          className="absolute top-3 right-3 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10"
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>

        {/* Floating decorations */}
        <Sparkles
          className="absolute top-4 right-12 w-5 h-5 text-yellow-400 animate-bounce"
          style={{ animationDelay: "0.1s" }}
        />
        <Sparkles
          className="absolute top-8 left-4 w-4 h-4 text-pink-400 animate-bounce"
          style={{ animationDelay: "0.3s" }}
        />

        {/* Main content */}
        <div className="pt-10 pb-6 px-6 text-center space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">{eventTitle}</p>
          </div>

          {/* Motivational phrase - cycles every 3 seconds */}
          <div className="min-h-[60px] flex items-center justify-center">
            <p
              className="text-base text-gray-700 dark:text-gray-200 italic px-2 leading-relaxed transition-opacity duration-500"
              key={currentPhrase}
            >
              &ldquo;{currentPhrase}&rdquo;
            </p>
          </div>

          {/* Invite section - appears after delay */}
          <div
            className={cn(
              "space-y-4 transition-all duration-500",
              showInvite
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            )}
          >
            <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>{t("invitePrompt")}</span>
            </div>

            <ShareButtons
              eventUrl={eventUrl}
              eventTitle={eventTitle}
              eventDescription={eventDescription}
              startsAt={startsAt}
              imageUrl={imageUrl}
              showWhatsApp
            />
          </div>
        </div>

        {/* Close button at bottom */}
        <button
          onClick={handleClose}
          className="w-full py-3 text-sm text-muted-foreground hover:text-foreground border-t border-gray-100 dark:border-gray-700 transition-colors"
        >
          {t("dismiss")}
        </button>
      </div>
    </div>,
    document.body
  );
}
