"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Rsvp } from "@/lib/types";

interface RsvpButtonProps {
  eventId: string;
  capacity: number | null;
  goingSpots: number;
  currentRsvp: Rsvp | null;
  isLoggedIn: boolean;
  waitlistPosition: number | null;
}

export function RsvpButton({
  eventId,
  capacity,
  goingSpots,
  currentRsvp,
  isLoggedIn,
  waitlistPosition,
}: RsvpButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isFull = capacity ? goingSpots >= capacity : false;
  const isGoing = currentRsvp?.status === "going";
  const isWaitlist = currentRsvp?.status === "waitlist";

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

  async function handleCancel() {
    setError(null);
    const supabase = createClient();

    startTransition(async () => {
      const { error: rpcError } = await supabase.rpc("cancel_rsvp", {
        p_event_id: eventId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      router.refresh();
    });
  }

  if (isGoing) {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleCancel}
          disabled={isPending}
          variant="outline"
          className="w-full"
        >
          {isPending ? "Cancelling..." : "Cancel RSVP"}
        </Button>
        <p className="text-sm text-green-600 text-center">
          You&apos;re going!
        </p>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  if (isWaitlist) {
    return (
      <div className="space-y-2">
        <Button
          onClick={handleCancel}
          disabled={isPending}
          variant="outline"
          className="w-full"
        >
          {isPending ? "Leaving..." : "Leave waitlist"}
        </Button>
        <div className="text-center space-y-1">
          <p className="text-sm text-orange-600 font-medium">
            You&apos;re #{waitlistPosition} on the waitlist
          </p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll automatically get a spot when one opens up
          </p>
        </div>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleRsvp}
        disabled={isPending}
        className="w-full"
      >
        {isPending
          ? "..."
          : isFull
            ? "Join waitlist"
            : "I'm going"}
      </Button>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  );
}
