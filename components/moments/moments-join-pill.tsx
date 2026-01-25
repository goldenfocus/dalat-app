"use client";

import { useState, useEffect } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MomentsJoinPillProps {
  /** Delay before showing the pill (in ms) */
  delay?: number;
}

/**
 * Floating pill that appears for anonymous users on desktop.
 * Non-blocking, dismissable, and remembers dismissal for the session.
 */
export function MomentsJoinPill({ delay = 2000 }: MomentsJoinPillProps) {
  const t = useTranslations("moments.desktopPill");
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Show pill after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (isDismissed || !isVisible) {
    return null;
  }

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="complementary"
      aria-label="Sign up invitation"
    >
      <div className="flex items-center gap-3 bg-background/95 backdrop-blur-sm border shadow-lg rounded-full pl-4 pr-2 py-2">
        {/* Icon */}
        <Sparkles className="w-4 h-4 text-violet-500 flex-shrink-0" />

        {/* Message */}
        <span className="text-sm text-foreground whitespace-nowrap">
          {t("message")}
        </span>

        {/* CTA Button */}
        <Button
          asChild
          size="sm"
          className="rounded-full px-4 bg-violet-600 hover:bg-violet-700"
        >
          <Link href="/auth/login?next=/moments">{t("cta")}</Link>
        </Button>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-full hover:bg-muted transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
