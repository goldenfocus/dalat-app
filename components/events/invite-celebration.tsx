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
  const [isVisible, setIsVisible] = useState(false);
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

  // Initialize celebration
  useEffect(() => {
    setPhrase(getRandomPhrase());

    // Fade in
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Fire confetti
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
        "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onClick={() => {
        setIsVisible(false);
        setTimeout(onComplete, 300);
      }}
    >
      {/* Animated background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-emerald-500/20 via-cyan-500/20 to-purple-500/20 blur-3xl animate-pulse" />
      </div>

      {/* Content card */}
      <div
        className={cn(
          "relative mx-4 max-w-md w-full bg-gradient-to-b from-gray-900/95 to-gray-950/95 rounded-3xl p-8 shadow-2xl border border-white/10 transition-all duration-500",
          isVisible ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        )}
      >
        {/* Decorative icons floating around */}
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-xl rounded-full" />
            <div className="relative bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full p-4 shadow-lg shadow-emerald-500/30">
              <Users className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Floating sparkles */}
        <Sparkles className="absolute top-4 right-6 w-5 h-5 text-yellow-400 animate-bounce" style={{ animationDelay: "0.1s" }} />
        <Heart className="absolute top-8 left-6 w-4 h-4 text-pink-400 animate-bounce" style={{ animationDelay: "0.3s" }} />
        <Sparkles className="absolute bottom-12 right-8 w-4 h-4 text-cyan-400 animate-bounce" style={{ animationDelay: "0.5s" }} />
        <Heart className="absolute bottom-16 left-8 w-5 h-5 text-rose-400 animate-bounce" style={{ animationDelay: "0.2s" }} />

        {/* Main content */}
        <div className="pt-8 text-center space-y-6">
          {/* Title with count */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
              {t("celebrationTitle")}
            </h2>
            <p className="text-lg text-white/90">
              {t("sentSuccess", { count: successCount })}
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 px-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          {/* Motivational phrase */}
          <p className="text-lg text-white/80 font-medium px-4 leading-relaxed min-h-[3.5rem]">
            &ldquo;{phrase}&rdquo;
          </p>

          {/* Tap to dismiss hint */}
          <p className="text-sm text-white/40 pt-2">
            Tap anywhere to dismiss
          </p>
        </div>

        {/* Progress bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 rounded-b-3xl overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 transition-all duration-50 ease-linear"
            style={{ width: `${100 - progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
