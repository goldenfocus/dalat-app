"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Calendar, Users } from "lucide-react";
import confetti from "canvas-confetti";
import { useTranslations } from "next-intl";

interface QuestionnaireCompleteProps {
  eventTitle: string;
  onClose: () => void;
}

export function QuestionnaireComplete({
  eventTitle,
  onClose,
}: QuestionnaireCompleteProps) {
  const t = useTranslations("questionnaire.complete");

  // Trigger confetti on mount
  useEffect(() => {
    const duration = 2000;
    const animationEnd = Date.now() + duration;

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      // Left side
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 55,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        colors: ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#54a0ff"],
      });

      // Right side
      confetti({
        particleCount,
        startVelocity: 30,
        spread: 55,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        colors: ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#54a0ff"],
      });
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center space-y-6 py-8">
      {/* Success icon with animation */}
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-in zoom-in duration-500">
          <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Event card preview */}
      <div className="bg-muted/50 rounded-xl p-4 mx-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
        <p className="font-medium text-lg">{eventTitle}</p>
        <div className="flex items-center justify-center gap-4 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {t("seeYouSoon")}
          </span>
        </div>
      </div>

      {/* Action button */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500">
        <Button
          onClick={onClose}
          size="lg"
          className="w-full max-w-xs"
        >
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
