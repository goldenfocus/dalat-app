"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MomentJoinCardProps {
  /** Use gentle messaging for repeat appearances */
  variant?: "default" | "gentle";
  /** Number of users exploring (for social proof) */
  userCount?: number;
  /** Index position in feed (for snap behavior) */
  index: number;
}

/**
 * Full-screen interstitial card for the TikTok-style feed.
 * Appears for anonymous users to encourage sign-up.
 * Designed to feel like part of the content, not a wall.
 */
export function MomentJoinCard({
  variant = "default",
  userCount = 0,
  index,
}: MomentJoinCardProps) {
  const t = useTranslations("moments.gate");

  const isGentle = variant === "gentle";

  return (
    <article
      className="h-[100dvh] w-full relative snap-start snap-always touch-manipulation"
      data-moment-card
      data-index={index}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950">
        {/* Subtle animated gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-500/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 text-center">
        {/* Icon */}
        <div className="mb-6">
          <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-violet-300" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-3">
          {isGentle ? t("gentleTitle") : t("title")}
        </h2>

        {/* Subtitle */}
        <p className="text-white/70 text-lg mb-8 max-w-xs">
          {isGentle && userCount > 0
            ? t("gentleSubtitle", { count: userCount })
            : t("subtitle")}
        </p>

        {/* CTA Button */}
        <Button
          asChild
          size="lg"
          className="bg-white text-slate-900 hover:bg-white/90 font-semibold px-8 py-6 text-base rounded-full shadow-lg shadow-violet-500/20"
        >
          <Link href="/auth/login?next=/moments">
            {isGentle ? t("gentleCta") : t("cta")}
          </Link>
        </Button>
      </div>

      {/* Swipe hint at bottom */}
      <div className="absolute bottom-8 inset-x-0 flex flex-col items-center text-white/40 animate-bounce">
        <ChevronDown className="w-6 h-6" />
        <span className="text-xs mt-1">{t("swipeHint")}</span>
      </div>
    </article>
  );
}
