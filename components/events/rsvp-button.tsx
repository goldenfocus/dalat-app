"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { EventFeedback } from "./event-feedback";
import type { Rsvp } from "@/lib/types";

interface RsvpButtonProps {
  eventId: string;
  eventTitle?: string;
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
}

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

export function RsvpButton({
  eventId,
  eventTitle = "",
  capacity,
  goingSpots,
  currentRsvp,
  isLoggedIn,
  waitlistPosition,
  startsAt,
  endsAt,
  existingFeedback,
}: RsvpButtonProps) {
  const router = useRouter();
  const t = useTranslations("rsvp");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPast = isEventPast(startsAt, endsAt);
  const isFull = capacity ? goingSpots >= capacity : false;
  const isGoing = currentRsvp?.status === "going";
  const isWaitlist = currentRsvp?.status === "waitlist";
  const isInterested = currentRsvp?.status === "interested";

  async function handleRsvp() {
    if (!isLoggedIn) {
      router.push("/auth/login");
      return;
    }

    setError(null);
    const supabase = createClient();

    startTransition(async () => {
      const { data, error: rpcError } = await supabase.rpc("rsvp_event", {
        p_event_id: eventId,
        p_plus_ones: 0,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      if (data?.status === "going") {
        fetch("/api/notifications/rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId }),
        }).catch(console.error);
      }

      router.refresh();
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

  // STATE: Event has ended - show feedback UI
  if (isPast) {
    return (
      <EventFeedback
        eventId={eventId}
        eventTitle={eventTitle}
        currentRsvpStatus={currentRsvp?.status ?? null}
        existingFeedback={existingFeedback}
      />
    );
  }

  // STATE: User is going
  if (isGoing) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={handleCancel}
            disabled={isPending}
            variant="outline"
            className="flex-1"
          >
            {isPending ? "..." : t("cancelRsvp")}
          </Button>
          <Button
            onClick={handleInterested}
            disabled={isPending}
            variant="ghost"
            className="flex-1"
          >
            {isPending ? "..." : t("justInterested")}
          </Button>
        </div>
        <p className="text-sm text-green-600 text-center">
          {t("youreGoing")}
        </p>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  // STATE: User is on waitlist
  if (isWaitlist) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={handleCancel}
            disabled={isPending}
            variant="outline"
            className="flex-1"
          >
            {isPending ? "..." : t("leaveWaitlist")}
          </Button>
          <Button
            onClick={handleInterested}
            disabled={isPending}
            variant="ghost"
            className="flex-1"
          >
            {isPending ? "..." : t("justInterested")}
          </Button>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm text-orange-600 font-medium">
            {t("waitlistPosition", { position: waitlistPosition ?? 0 })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("waitlistAutoPromote")}
          </p>
        </div>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  // STATE: User is interested
  if (isInterested) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={handleRsvp}
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
          </Button>
          <Button
            onClick={handleCancel}
            disabled={isPending}
            variant="outline"
            className="flex-1"
          >
            {isPending ? "..." : t("notInterested")}
          </Button>
        </div>
        <p className="text-sm text-blue-600 text-center">
          {t("youreInterested")}
        </p>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  // DEFAULT STATE: No RSVP - show side-by-side buttons
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          onClick={handleRsvp}
          disabled={isPending}
          className="flex-1"
        >
          {isPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
        </Button>
        <Button
          onClick={handleInterested}
          disabled={isPending}
          variant="outline"
          className="flex-1"
        >
          {isPending ? "..." : t("interested")}
        </Button>
      </div>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  );
}
