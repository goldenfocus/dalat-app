"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { Sparkles, Heart, Users } from "lucide-react";

interface InviteCelebrationProps {
  successCount: number;
  onComplete: () => void;
  autoCloseDelay?: number; // ms, default 4000
}

export function InviteCelebration({
  successCount,
  onComplete,
  autoCloseDelay = 4000,
}: InviteCelebrationProps) {
  const t = useTranslations("invite");
  const [phrase, setPhrase] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  // Get a random celebration phrase
  const getRandomPhrase = useCallback(() => {
    const phrases = t.raw("celebrationPhrases") as string[];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }, [t]);

  // Fire celebration confetti
  const fireCelebration = useCallback(() => {
    // Bigger, more colorful confetti burst
    const colors = ["#00ff41", "#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff9f43"];

    // Center burst
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.5, x: 0.5 },
      colors,
      startVelocity: 45,
      gravity: 0.8,
    });

    // Left burst
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 70,
        origin: { x: 0, y: 0.5 },
        colors,
        startVelocity: 40,
      });
    }, 200);

    // Right burst
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 70,
        origin: { x: 1, y: 0.5 },
        colors,
        startVelocity: 40,
      });
    }, 400);

    // Final sparkle burst from bottom
    setTimeout(() => {
      confetti({
        particleCount: 100,
        angle: 90,
        spread: 120,
        origin: { x: 0.5, y: 1 },
        colors,
        startVelocity: 50,
        gravity: 1.2,
      });
    }, 600);
  }, []);

  // Initialize celebration - fire confetti immediately with modal already visible
  useEffect(() => {
    setPhrase(getRandomPhrase());
    fireCelebration();
  }, [getRandomPhrase, fireCelebration]);

  // Progress bar and auto-close
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / autoCloseDelay) * 100, 100);
      setProgress(newProgress);

      if (elapsed >= autoCloseDelay) {
        clearInterval(interval);
        setIsVisible(false);
        // Wait for fade out animation before calling onComplete
        setTimeout(onComplete, 300);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [autoCloseDelay, onComplete]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] grid place-items-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onClick={() => {
        setIsVisible(false);
        setTimeout(onComplete, 300);
      }}
    >
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-purple-500/20 blur-3xl animate-pulse" />
      </div>

      {/* Content card - truly centered */}
      <div
        className={cn(
          "relative mx-4 max-w-sm w-full bg-gradient-to-b from-white to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-3xl p-6 pt-8 shadow-2xl border border-emerald-200 dark:border-emerald-500/30 transition-all duration-500",
          isVisible ? "scale-100" : "scale-95 opacity-0"
        )}
      >
        {/* Top icon */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-xl rounded-full" />
            <div className="relative bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-3 shadow-lg shadow-emerald-500/30">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* Floating sparkles */}
        <Sparkles className="absolute top-3 right-4 w-4 h-4 text-yellow-400 animate-bounce" style={{ animationDelay: "0.1s" }} />
        <Heart className="absolute top-6 left-4 w-3 h-3 text-pink-400 animate-bounce" style={{ animationDelay: "0.3s" }} />

        {/* Main content */}
        <div className="pt-6 text-center space-y-4">
          {/* Title with count */}
          <div className="space-y-1">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 bg-clip-text text-transparent">
              {t("celebrationTitle")}
            </h2>
            <p className="text-base text-gray-800 dark:text-white/90 font-medium">
              {t("sentSuccess", { count: successCount })}
            </p>
          </div>

          {/* Motivational phrase */}
          <p className="text-base text-gray-600 dark:text-white/80 italic px-2 leading-relaxed">
            &ldquo;{phrase}&rdquo;
          </p>

          {/* Tap to dismiss hint */}
          <p className="text-xs text-gray-400 dark:text-white/40">
            Tap anywhere to dismiss
          </p>
        </div>

        {/* Progress bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-200 dark:bg-white/5 rounded-b-3xl overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 transition-all duration-50 ease-linear"
            style={{ width: `${100 - progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
