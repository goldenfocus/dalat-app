"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRsvpActions, isEventPast } from "./rsvp-button";
import type { Rsvp } from "@/lib/types";

interface FloatingRsvpBarProps {
  eventId: string;
  capacity: number | null;
  goingSpots: number;
  currentRsvp: Rsvp | null;
  isLoggedIn: boolean;
  waitlistPosition: number | null;
  startsAt: string;
  endsAt: string | null;
}

export function FloatingRsvpBar({
  eventId,
  capacity,
  goingSpots,
  currentRsvp,
  isLoggedIn,
  waitlistPosition,
  startsAt,
  endsAt,
}: FloatingRsvpBarProps) {
  const t = useTranslations("rsvp");
  const { isPending, handleRsvp, handleCancel } = useRsvpActions(
    eventId,
    isLoggedIn
  );

  const isPast = isEventPast(startsAt, endsAt);
  const isFull = capacity ? goingSpots >= capacity : false;
  const isGoing = currentRsvp?.status === "going";
  const isWaitlist = currentRsvp?.status === "waitlist";
  const isInterested = currentRsvp?.status === "interested";

  // Don't show for past events
  if (isPast) {
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

  return (
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
  );
}
