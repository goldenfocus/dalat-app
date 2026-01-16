"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Check, X, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvitationRsvpStatus } from "@/lib/types";

// Helper to check if event is past (mirrors database logic)
function isEventPast(startsAt: string, endsAt: string | null): boolean {
  const now = new Date();
  if (endsAt) {
    return new Date(endsAt) < now;
  }
  // Default: 4 hours after start
  const startDate = new Date(startsAt);
  const defaultEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  return defaultEnd < now;
}

interface InviteRsvpButtonsProps {
  token: string;
  currentResponse: InvitationRsvpStatus | null;
  compact?: boolean;
  autoRsvp?: string;
  startsAt: string;
  endsAt: string | null;
}

export function InviteRsvpButtons({ token, currentResponse, compact, autoRsvp, startsAt, endsAt }: InviteRsvpButtonsProps) {
  const t = useTranslations("invite");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [response, setResponse] = useState<InvitationRsvpStatus | null>(currentResponse);
  const [error, setError] = useState<string | null>(null);

  const isPast = isEventPast(startsAt, endsAt);

  // Handle auto-RSVP from email link (only if event isn't past)
  useEffect(() => {
    if (autoRsvp && !currentResponse && !isPast && ["going", "interested", "cancelled"].includes(autoRsvp)) {
      handleRsvp(autoRsvp as InvitationRsvpStatus);
    }
  }, [autoRsvp, currentResponse, isPast]);

  const handleRsvp = async (newResponse: InvitationRsvpStatus) => {
    setSubmitting(newResponse);
    setError(null);

    try {
      const res = await fetch(`/api/invite/${token}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: newResponse }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("rsvpFailed"));
        return;
      }

      setResponse(newResponse);

      // Clear URL params after successful auto-RSVP
      if (autoRsvp) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err) {
      setError(t("rsvpFailed"));
    } finally {
      setSubmitting(null);
    }
  };

  // Event has ended - show message instead of buttons
  if (isPast) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">{t("eventEnded")}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant={response === "going" ? "default" : "outline"}
          size="sm"
          onClick={() => handleRsvp("going")}
          disabled={submitting !== null}
          className="gap-1"
        >
          {submitting === "going" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {t("going")}
        </Button>
        <Button
          variant={response === "interested" ? "default" : "outline"}
          size="sm"
          onClick={() => handleRsvp("interested")}
          disabled={submitting !== null}
          className="gap-1"
        >
          {submitting === "interested" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <HelpCircle className="w-4 h-4" />
          )}
          {t("maybe")}
        </Button>
        <Button
          variant={response === "cancelled" ? "default" : "outline"}
          size="sm"
          onClick={() => handleRsvp("cancelled")}
          disabled={submitting !== null}
          className="gap-1"
        >
          {submitting === "cancelled" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          {t("notGoing")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={response === "going" ? "default" : "outline"}
          onClick={() => handleRsvp("going")}
          disabled={submitting !== null}
          className="flex-col h-auto py-4 gap-2"
        >
          {submitting === "going" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Check className="w-6 h-6" />
          )}
          <span className="text-sm">{t("going")}</span>
        </Button>
        <Button
          variant={response === "interested" ? "default" : "outline"}
          onClick={() => handleRsvp("interested")}
          disabled={submitting !== null}
          className="flex-col h-auto py-4 gap-2"
        >
          {submitting === "interested" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <HelpCircle className="w-6 h-6" />
          )}
          <span className="text-sm">{t("maybe")}</span>
        </Button>
        <Button
          variant={response === "cancelled" ? "default" : "outline"}
          onClick={() => handleRsvp("cancelled")}
          disabled={submitting !== null}
          className="flex-col h-auto py-4 gap-2"
        >
          {submitting === "cancelled" ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <X className="w-6 h-6" />
          )}
          <span className="text-sm">{t("notGoing")}</span>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
