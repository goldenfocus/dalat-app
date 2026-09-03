"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Users, Camera, Heart, Loader2 } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface EventRecapCardProps {
  story: string | null;
  eventSlug: string;
  storyLanguage?: string;
  wentCount: number;
  momentsCount: number;
  positivePercent: number | null;
}

/** Published automatically after the event's audio and images have been analyzed. */
export function EventRecapCard({
  story,
  eventSlug,
  storyLanguage = "en",
  wentCount,
  momentsCount,
  positivePercent,
}: EventRecapCardProps) {
  const t = useTranslations("recap");
  const router = useRouter();
  useEffect(() => {
    if (story || !momentsCount) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [story, momentsCount, router]);
  if (!story && !momentsCount) return null;

  return (
    <section
      id="recap"
      aria-labelledby="recap-heading"
      className="rounded-xl border bg-card p-5 space-y-4"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <h2 id="recap-heading" className="font-semibold text-sm">
          {t("howItWent")}
        </h2>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {wentCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {t("wentCount", { count: wentCount })}
          </span>
        )}
        {momentsCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            {t("momentsCount", { count: momentsCount })}
          </span>
        )}
        {positivePercent !== null && (
          <span className="flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5" />
            {t("positiveFeedback", { percent: positivePercent })}
          </span>
        )}
      </div>
      {story ? (
        <>
          <div
            lang={storyLanguage}
            className="prose prose-sm dark:prose-invert max-w-none"
          >
            <MarkdownRenderer content={story} />
          </div>
          <Link
            href={`/events/${eventSlug}/moments`}
            className="inline-flex items-center gap-2 text-sm font-medium text-primary"
          >
            <Camera className="w-4 h-4" />
            {t("viewMoments")}
          </Link>
          <p className="text-xs text-muted-foreground/70">{t("aiNote")}</p>
        </>
      ) : (
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-muted-foreground"
        >
          <Loader2
            aria-hidden="true"
            className="w-4 h-4 mt-0.5 shrink-0 animate-spin"
          />
          {t("automaticPending")}
        </p>
      )}
    </section>
  );
}
