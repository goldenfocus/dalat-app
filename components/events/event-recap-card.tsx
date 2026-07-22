"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sparkles, Users, Camera, Heart } from "lucide-react";
import { MarkdownRenderer } from "@/components/blog/markdown-renderer";

interface EventRecapCardProps {
  eventId: string;
  /** Localized recap story (already translated server-side); null = no recap yet */
  story: string | null;
  blogPostId: string | null;
  isPublished: boolean;
  isModerator: boolean;
  wentCount: number;
  momentsCount: number;
  /** null unless feedback total >= 10 */
  positivePercent: number | null;
}

/**
 * "How it went" — the past-event recap card. Public once a moderator
 * publishes; moderators see drafts in place with a publish button, or a
 * generate button when no recap exists yet.
 */
export function EventRecapCard({
  eventId,
  story,
  blogPostId,
  isPublished,
  isModerator,
  wentCount,
  momentsCount,
  positivePercent,
}: EventRecapCardProps) {
  const t = useTranslations("recap");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [enqueued, setEnqueued] = useState(false);

  // Nothing to show non-moderators until published
  if (!isModerator && (!story || !isPublished)) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/blog/generate-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (res.ok) setEnqueued(true);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!blogPostId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/blog/publish-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogPostId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold text-sm">{t("howItWent")}</h3>
        </div>
        {isModerator && story && !isPublished && (
          <button
            onClick={publish}
            disabled={busy}
            className="text-sm font-medium text-primary px-3 py-2 rounded-lg hover:bg-primary/5 active:scale-95 transition-all disabled:opacity-50"
          >
            {t("publish")}
          </button>
        )}
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
          {isModerator && !isPublished && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("draftNotice")}</p>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={story} />
          </div>
          <p className="text-xs text-muted-foreground/70">{t("aiNote")}</p>
        </>
      ) : isModerator ? (
        enqueued ? (
          <p className="text-sm text-muted-foreground">{t("enqueued")}</p>
        ) : (
          <button
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {t("generate")}
          </button>
        )
      ) : null}
    </div>
  );
}
