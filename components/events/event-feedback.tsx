"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface EventFeedbackProps {
  eventId: string;
  eventTitle: string;
  currentRsvpStatus: string | null;
  existingFeedback?: {
    rating?: string;
    comment?: string;
    marked_no_show?: boolean;
  } | null;
}

const RATINGS = [
  { value: "amazing", emoji: "🎉", labelKey: "amazing" },
  { value: "good", emoji: "😊", labelKey: "good" },
  { value: "okay", emoji: "😐", labelKey: "okay" },
  { value: "not_great", emoji: "😕", labelKey: "notGreat" },
] as const;

export function EventFeedback({
  eventId,
  eventTitle,
  currentRsvpStatus,
  existingFeedback,
}: EventFeedbackProps) {
  const router = useRouter();
  const t = useTranslations("feedback");
  const [isPending, startTransition] = useTransition();
  const [selectedRating, setSelectedRating] = useState<string | null>(
    existingFeedback?.rating ?? null
  );
  const [comment, setComment] = useState(existingFeedback?.comment ?? "");
  const [showComment, setShowComment] = useState(!!existingFeedback?.comment);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(
    !!existingFeedback?.rating || !!existingFeedback?.marked_no_show
  );

  // User was never going - just show "Event has ended" message
  const wasAttending = currentRsvpStatus === "going" || currentRsvpStatus === "waitlist";

  // Already submitted feedback
  if (submitted) {
    if (existingFeedback?.marked_no_show) {
      return (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">{t("markedNoShow")}</p>
        </div>
      );
    }

    const submittedRating = RATINGS.find((r) => r.value === (existingFeedback?.rating ?? selectedRating));
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-2xl">{submittedRating?.emoji}</p>
        <p className="text-sm text-muted-foreground">{t("thankYou")}</p>
      </div>
    );
  }

  // User wasn't attending - just show event ended
  if (!wasAttending) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">{t("eventEnded")}</p>
      </div>
    );
  }

  async function handleSubmitFeedback(rating: string) {
    setError(null);
    setSelectedRating(rating);
    const supabase = createClient();

    startTransition(async () => {
      const { error: rpcError } = await supabase.rpc("submit_event_feedback", {
        p_event_id: eventId,
        p_rating: rating,
        p_comment: comment || null,
        p_did_not_attend: false,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setSubmitted(true);
      router.refresh();
    });
  }

  async function handleDidNotAttend() {
    setError(null);
    const supabase = createClient();

    startTransition(async () => {
      const { error: rpcError } = await supabase.rpc("submit_event_feedback", {
        p_event_id: eventId,
        p_rating: null,
        p_comment: null,
        p_did_not_attend: true,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setSubmitted(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm font-medium">{t("howWasIt")}</p>
      </div>

      {/* Rating buttons */}
      <div className="flex justify-center gap-2">
        {RATINGS.map((rating) => (
          <button
            key={rating.value}
            onClick={() => {
              if (showComment) {
                handleSubmitFeedback(rating.value);
              } else {
                setSelectedRating(rating.value);
                setShowComment(true);
              }
            }}
            disabled={isPending}
            className={cn(
              "flex flex-col items-center gap-1 p-3 rounded-xl transition-all",
              "hover:bg-muted active:scale-95",
              selectedRating === rating.value && "bg-muted ring-2 ring-primary"
            )}
          >
            <span className="text-2xl">{rating.emoji}</span>
            <span className="text-xs text-muted-foreground">
              {t(rating.labelKey)}
            </span>
          </button>
        ))}
      </div>

      {/* Optional comment */}
      {showComment && selectedRating && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("commentPlaceholder")}
            rows={2}
            className="resize-none"
          />
          <Button
            onClick={() => handleSubmitFeedback(selectedRating)}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? "..." : t("submit")}
          </Button>
        </div>
      )}

      {/* "I didn't go" option */}
      <div className="text-center pt-2 border-t">
        <button
          onClick={handleDidNotAttend}
          disabled={isPending}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-4"
        >
          {t("didNotAttend")}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  );
}

// Compact badge showing aggregate feedback for past events
interface FeedbackBadgeProps {
  positivePercentage: number | null;
  totalFeedback: number;
}

export function FeedbackBadge({ positivePercentage, totalFeedback }: FeedbackBadgeProps) {
  const t = useTranslations("feedback");

  if (totalFeedback === 0 || positivePercentage === null) {
    return null;
  }

  const emoji = positivePercentage >= 80 ? "🎉" : positivePercentage >= 60 ? "👍" : "😐";

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{emoji}</span>
      <span>
        {t("positiveRating", { percentage: positivePercentage, count: totalFeedback })}
      </span>
    </div>
  );
}
