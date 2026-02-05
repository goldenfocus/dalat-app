"use client";

import { useState, useTransition, createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { EventFeedback } from "./event-feedback";
import { RsvpCelebration } from "./rsvp-celebration";
import { QuestionnaireFlow } from "@/components/questionnaire";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { submitQuestionnaireResponses } from "@/lib/questionnaire";
import type { Rsvp, QuestionnaireData } from "@/lib/types";

// Context for coordinating celebration state and RSVP card visibility across components
interface CelebrationContextValue {
  isCelebrating: boolean;
  setCelebrating: (value: boolean) => void;
  isRsvpCardVisible: boolean;
  setRsvpCardVisible: (value: boolean) => void;
}

const CelebrationContext = createContext<CelebrationContextValue>({
  isCelebrating: false,
  setCelebrating: () => {},
  isRsvpCardVisible: true,
  setRsvpCardVisible: () => {},
});

export const useCelebration = () => useContext(CelebrationContext);

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [isCelebrating, setCelebrating] = useState(false);
  const [isRsvpCardVisible, setRsvpCardVisible] = useState(true);
  return (
    <CelebrationContext.Provider value={{ isCelebrating, setCelebrating, isRsvpCardVisible, setRsvpCardVisible }}>
      {children}
    </CelebrationContext.Provider>
  );
}

/**
 * Wrapper that observes when the RSVP buttons are visible in viewport.
 * Used to show/hide the floating RSVP bar on mobile.
 */
export function RsvpCardObserver({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { setRsvpCardVisible } = useCelebration();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setRsvpCardVisible(entry.isIntersecting);
      },
      { threshold: 0.1 } // Consider visible if 10% is in view
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [setRsvpCardVisible]);

  return <div ref={ref}>{children}</div>;
}

interface RsvpButtonProps {
  eventId: string;
  eventSlug: string;
  eventTitle?: string;
  eventDescription?: string | null;
  eventImageUrl?: string | null;
  locationName?: string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
  capacity: number | null;
  goingSpots: number;
  currentRsvp: Rsvp | null;
  isLoggedIn: boolean;
  waitlistPosition: number | null;
  startsAt: string;
  endsAt: string | null;
  existingFeedback?: {
    rating?: string;
    comment?: string;
    marked_no_show?: boolean;
  } | null;
  questionnaire?: QuestionnaireData | null;
}

// Helper to check if event is past (mirrors database logic)
// Exported for use in floating-rsvp-bar and other components
export function isEventPast(startsAt: string, endsAt: string | null): boolean {
  const now = new Date();
  if (endsAt) {
    return new Date(endsAt) < now;
  }
  // Default: 4 hours after start
  const startDate = new Date(startsAt);
  const defaultEnd = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
  return defaultEnd < now;
}

// Hook for RSVP actions - shared between RsvpButton and FloatingRsvpBar
export function useRsvpActions(
  eventId: string,
  isLoggedIn: boolean,
  onRsvpSuccess?: () => void,
  questionnaire?: QuestionnaireData | null,
  onShowQuestionnaire?: () => void
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastRsvpId, setLastRsvpId] = useState<string | null>(null);

  // Check if questionnaire should be shown
  const hasActiveQuestionnaire = questionnaire?.is_enabled &&
    questionnaire.questions.length > 0;

  async function handleRsvp() {
    if (!isLoggedIn) {
      router.push("/auth/login");
      return;
    }

    // If there's a questionnaire, show it instead of directly RSVP'ing
    if (hasActiveQuestionnaire && onShowQuestionnaire) {
      onShowQuestionnaire();
      return;
    }

    // Otherwise, proceed with direct RSVP
    await performRsvp();
  }

  // Perform the actual RSVP (called directly or after questionnaire)
  async function performRsvp(
    questionnaireResponses?: Record<string, string | string[]>
  ): Promise<{ success: boolean; rsvpId?: string }> {
    setError(null);
    const supabase = createClient();

    return new Promise((resolve) => {
      startTransition(async () => {
        const { data, error: rpcError } = await supabase.rpc("rsvp_event", {
          p_event_id: eventId,
          p_plus_ones: 0,
        });

        if (rpcError) {
          setError(rpcError.message);
          resolve({ success: false });
          return;
        }

        const rsvpId = data?.rsvp_id;
        setLastRsvpId(rsvpId || null);

        // If we have questionnaire responses, save them
        if (rsvpId && questionnaireResponses && Object.keys(questionnaireResponses).length > 0) {
          const result = await submitQuestionnaireResponses(rsvpId, questionnaireResponses);
          if (!result.success) {
            console.error("Failed to save questionnaire responses:", result.error);
            // Continue anyway - RSVP was successful
          }
        }

        if (data?.status === "going") {
          // Trigger celebration!
          onRsvpSuccess?.();

          fetch("/api/notifications/rsvp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId }),
          }).catch(console.error);
        }

        router.refresh();
        resolve({ success: true, rsvpId });
      });
    });
  }

  async function handleInterested() {
    if (!isLoggedIn) {
      router.push("/auth/login");
      return;
    }

    setError(null);
    const supabase = createClient();

    startTransition(async () => {
      const { data, error: rpcError } = await supabase.rpc("mark_interested", {
        p_event_id: eventId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      // Handle waitlist promotion if user switched from going
      if (data?.promoted_user) {
        fetch("/api/notifications/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            promotedUserId: data.promoted_user,
          }),
        }).catch(console.error);
      }

      // Schedule reminders for interested users
      fetch("/api/notifications/interested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      }).catch(console.error);

      router.refresh();
    });
  }

  async function handleCancel() {
    setError(null);
    const supabase = createClient();

    startTransition(async () => {
      const { data, error: rpcError } = await supabase.rpc("cancel_rsvp", {
        p_event_id: eventId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      // Notify promoted user if someone got bumped up from waitlist
      if (data?.promoted_user) {
        fetch("/api/notifications/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            promotedUserId: data.promoted_user,
          }),
        }).catch(console.error);
      }

      router.refresh();
    });
  }

  return {
    isPending,
    error,
    handleRsvp,
    handleInterested,
    handleCancel,
    performRsvp,
    lastRsvpId,
    hasActiveQuestionnaire,
  };
}

export function RsvpButton({
  eventId,
  eventSlug,
  eventTitle = "",
  eventDescription = null,
  eventImageUrl = null,
  locationName = null,
  address = null,
  googleMapsUrl = null,
  capacity,
  goingSpots,
  currentRsvp,
  isLoggedIn,
  waitlistPosition,
  startsAt,
  endsAt,
  existingFeedback,
  questionnaire,
}: RsvpButtonProps) {
  const t = useTranslations("rsvp");
  const [showCelebration, setShowCelebration] = useState(false);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const celebration = useCelebration();

  const handleCelebrationTrigger = () => {
    setShowCelebration(true);
    celebration.setCelebrating(true);
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    celebration.setCelebrating(false);
  };

  const handleShowQuestionnaire = useCallback(() => {
    setShowQuestionnaire(true);
  }, []);

  const { isPending, error, handleRsvp, handleInterested, handleCancel, performRsvp, hasActiveQuestionnaire } =
    useRsvpActions(eventId, isLoggedIn, handleCelebrationTrigger, questionnaire, handleShowQuestionnaire);

  // Handle questionnaire submission
  const handleQuestionnaireSubmit = useCallback(async (responses: Record<string, string | string[]>) => {
    await performRsvp(responses);
    setShowQuestionnaire(false);
  }, [performRsvp]);

  const handleQuestionnaireCancel = useCallback(() => {
    setShowQuestionnaire(false);
  }, []);

  // Build event URL for sharing
  const eventUrl = typeof window !== "undefined"
    ? `${window.location.origin}/events/${eventSlug}`
    : `/events/${eventSlug}`;

  const isPast = isEventPast(startsAt, endsAt);
  const isFull = capacity ? goingSpots >= capacity : false;
  const isGoing = currentRsvp?.status === "going";
  const isWaitlist = currentRsvp?.status === "waitlist";
  const isInterested = currentRsvp?.status === "interested";

  // Render celebration portal (always rendered, controlled by showCelebration state)
  const celebrationPortal = showCelebration && (
    <RsvpCelebration
      eventUrl={eventUrl}
      eventTitle={eventTitle}
      eventDescription={eventDescription}
      startsAt={startsAt}
      endsAt={endsAt}
      imageUrl={eventImageUrl}
      locationName={locationName}
      address={address}
      googleMapsUrl={googleMapsUrl}
      onComplete={handleCelebrationComplete}
    />
  );

  // Questionnaire sheet
  const questionnaireSheet = hasActiveQuestionnaire && questionnaire && (
    <Sheet open={showQuestionnaire} onOpenChange={setShowQuestionnaire}>
      <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-2xl">
        <SheetHeader className="sr-only">
          <SheetTitle>RSVP Questions</SheetTitle>
        </SheetHeader>
        <div className="h-full overflow-y-auto">
          <QuestionnaireFlow
            questions={questionnaire.questions}
            introText={questionnaire.intro_text}
            eventTitle={eventTitle}
            onSubmit={handleQuestionnaireSubmit}
            onCancel={handleQuestionnaireCancel}
          />
        </div>
      </SheetContent>
    </Sheet>
  );

  // STATE: Event has ended - show feedback UI
  if (isPast) {
    return (
      <>
        {celebrationPortal}
        {questionnaireSheet}
        <EventFeedback
          eventId={eventId}
          eventTitle={eventTitle}
          currentRsvpStatus={currentRsvp?.status ?? null}
          existingFeedback={existingFeedback}
        />
      </>
    );
  }

  // STATE: User is going
  if (isGoing) {
    return (
      <>
        {celebrationPortal}
        {questionnaireSheet}
        <div className="space-y-3">
          <p className="text-sm text-green-600 font-medium text-center">
            {t("youreGoing")}
          </p>
          <Button
            onClick={handleCancel}
            disabled={isPending}
            variant="outline"
            className="w-full"
          >
            {isPending ? "..." : t("cancelRsvp")}
          </Button>
          <button
            onClick={handleInterested}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : t("justInterested")}
          </button>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      </>
    );
  }

  // STATE: User is on waitlist
  if (isWaitlist) {
    return (
      <>
        {celebrationPortal}
        {questionnaireSheet}
        <div className="space-y-3">
          <div className="text-center space-y-1">
            <p className="text-sm text-orange-600 font-medium">
              {t("waitlistPosition", { position: waitlistPosition ?? 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("waitlistAutoPromote")}
            </p>
          </div>
          <Button
            onClick={handleCancel}
            disabled={isPending}
            variant="outline"
            className="w-full"
          >
            {isPending ? "..." : t("leaveWaitlist")}
          </Button>
          <button
            onClick={handleInterested}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : t("justInterested")}
          </button>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      </>
    );
  }

  // STATE: User is interested
  if (isInterested) {
    return (
      <>
        {celebrationPortal}
        {questionnaireSheet}
        <div className="space-y-3">
          <p className="text-sm text-blue-600 font-medium text-center">
            {t("youreInterested")}
          </p>
          <Button
            onClick={handleRsvp}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
          </Button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isPending ? "..." : t("notInterested")}
          </button>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        </div>
      </>
    );
  }

  // DEFAULT STATE: No RSVP - stacked buttons with clear hierarchy
  return (
    <>
      {celebrationPortal}
      {questionnaireSheet}
      <div className="space-y-3">
        <Button
          onClick={handleRsvp}
          disabled={isPending}
          className="w-full"
        >
          {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
        </Button>
        <Button
          onClick={handleInterested}
          disabled={isPending}
          variant="outline"
          className="w-full"
        >
          {isPending ? "..." : t("interested")}
        </Button>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    </>
  );
}
