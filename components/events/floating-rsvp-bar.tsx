"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRsvpActions, isEventPast, useCelebration } from "./rsvp-button";
import { RsvpCelebration } from "./rsvp-celebration";
import { QuestionnaireFlow } from "@/components/questionnaire";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Rsvp, QuestionnaireData } from "@/lib/types";

interface FloatingRsvpBarProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  eventDescription: string | null;
  eventImageUrl: string | null;
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
  questionnaire?: QuestionnaireData | null;
}

export function FloatingRsvpBar({
  eventId,
  eventSlug,
  eventTitle,
  eventDescription,
  eventImageUrl,
  locationName,
  address,
  googleMapsUrl,
  capacity,
  goingSpots,
  currentRsvp,
  isLoggedIn,
  waitlistPosition,
  startsAt,
  endsAt,
  questionnaire,
}: FloatingRsvpBarProps) {
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

  const { isPending, handleRsvp, handleCancel, performRsvp, hasActiveQuestionnaire } = useRsvpActions(
    eventId,
    isLoggedIn,
    handleCelebrationTrigger,
    questionnaire,
    handleShowQuestionnaire
  );

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

  // Don't show for past events
  if (isPast) {
    return null;
  }

  // Hide during celebration
  if (celebration.isCelebrating) {
    return null;
  }

  // Hide when sidebar RSVP card is visible (no need for duplicate buttons)
  if (celebration.isRsvpCardVisible) {
    return null;
  }

  // Determine status text and action
  let statusText: string | null = null;
  let actionButton: React.ReactNode = null;

  if (isGoing) {
    statusText = t("youreGoing");
    actionButton = (
      <Button
        onClick={handleCancel}
        disabled={isPending}
        variant="outline"
        size="sm"
      >
        {isPending ? "..." : t("cancelRsvp")}
      </Button>
    );
  } else if (isWaitlist) {
    statusText = t("waitlistPosition", { position: waitlistPosition ?? 0 });
    actionButton = (
      <Button
        onClick={handleCancel}
        disabled={isPending}
        variant="outline"
        size="sm"
      >
        {isPending ? "..." : t("leaveWaitlist")}
      </Button>
    );
  } else if (isInterested) {
    statusText = t("youreInterested");
    actionButton = (
      <Button onClick={handleRsvp} disabled={isPending} size="sm">
        {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
      </Button>
    );
  } else {
    // Default: not RSVPed
    actionButton = (
      <Button onClick={handleRsvp} disabled={isPending} className="flex-1">
        {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
      </Button>
    );
  }

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

  return (
    <>
      {questionnaireSheet}
      {showCelebration && (
        <RsvpCelebration
          eventUrl={eventUrl}
          eventTitle={eventTitle}
          eventDescription={eventDescription}
          startsAt={startsAt}
          endsAt={endsAt}
          locationName={locationName}
          address={address}
          googleMapsUrl={googleMapsUrl}
          onComplete={handleCelebrationComplete}
        />
      )}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 lg:hidden">
        <div className="mx-4 mb-2">
          <div className="bg-background/95 backdrop-blur-sm border rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-3">
            {statusText ? (
              <>
                <span
                  className={`text-sm font-medium truncate ${
                    isGoing
                      ? "text-green-600"
                      : isWaitlist
                        ? "text-orange-600"
                        : "text-blue-600"
                  }`}
                >
                  {statusText}
                </span>
                {actionButton}
              </>
            ) : (
              actionButton
            )}
          </div>
        </div>
      </div>
    </>
  );
}
