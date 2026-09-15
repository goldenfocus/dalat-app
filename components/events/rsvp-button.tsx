"use client";
import { prepareCelebrationAudio } from "@/lib/communities/celebration-audio";

import { currentCommunityVisit } from "@/lib/communities/activity";
import { startSignupIntent } from "@/lib/auth/start-intent";
import { useCommunityRsvp, CommunityRsvpChoice } from "./community-rsvp";
import { useState, useTransition, createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
  onShowQuestionnaire?: () => void,
  currentStatus?: Rsvp["status"] | null
) {
  const router = useRouter();
  const communityContext = useCommunityRsvp();
  const [transitionPending, startTransition] = useTransition();
  const [interestedPending, setInterestedPending] = useState(false);
  const interestedLock = useRef(false);
  const [confirmedStatus, setConfirmedStatus] = useState<Rsvp["status"] | null | undefined>();
  useEffect(() => { setConfirmedStatus(undefined); }, [eventId, currentStatus]);
  const isPending = transitionPending || interestedPending;
  // Bound both network and auth-lock waits. A timed-out write may have reached
  // the server, so never claim it failed or retry it automatically.
  async function boundedRpc(name: string, args: Record<string, unknown>) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        createClient().rpc(name, args).abortSignal(controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Could not confirm the update. Please try again.")); }, 12000); }),
      ]);
    } finally { clearTimeout(timer!); }
  }
  const [error, setError] = useState<string | null>(null);
  const [lastRsvpId, setLastRsvpId] = useState<string | null>(null);

  // Check if questionnaire should be shown
  const hasActiveQuestionnaire = questionnaire?.is_enabled &&
    questionnaire.questions.length > 0;

  async function handleRsvp() {
    prepareCelebrationAudio();
    if (!isLoggedIn) {
      setError(null);
      try { await startSignupIntent({ kind: "event", slug: communityContext.eventSlug || window.location.pathname.split("/").pop()!, joinCommunity: communityContext.join, communitySlug: communityContext.community?.slug }); }
      catch { setError("Could not continue. Please try again."); }
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

  async function joinSelectedCommunity(celebrate: boolean) {
    if (!communityContext.join || !communityContext.community || communityContext.member) return;
    const supabase = createClient();
    let result;
    try { result = await boundedRpc("join_community", {p_slug:communityContext.community.slug}); }
    catch { communityContext.setJoinStatus('failed'); return; }
    const {data, error: joinError} = result;
    if (joinError) { communityContext.setJoinStatus('failed'); return; }
    if (data?.status === 'requested') { communityContext.setJoin(false); communityContext.setJoinStatus('requested'); return; }
    if (data?.status !== 'joined') return;
    communityContext.confirmJoin(celebrate);
    const visit = currentCommunityVisit(communityContext.community.slug);
    if (visit) {
      const slug = communityContext.community.slug;
      void (async () => {
        const {data:community} = await supabase.from('tribes').select('id').eq('slug',slug).maybeSingle();
        if (community) await supabase.rpc('complete_community_visit',{p_visit_id:visit.id,p_community_id:community.id});
      })().catch(console.error);
    }
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

        setConfirmedStatus(data?.status);
        await joinSelectedCommunity(false);
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
    if (interestedLock.current || isPending) return;
    interestedLock.current = true;
    setInterestedPending(true);
    setError(null);
    prepareCelebrationAudio();
    try {
      if (!isLoggedIn) {
        try { await startSignupIntent({kind:"event",slug:communityContext.eventSlug || window.location.pathname.split("/").pop()!,eventAction:"interested",joinCommunity:communityContext.join,communitySlug:communityContext.community?.slug}); }
        catch { setError("Could not continue. Please try again."); }
        return;
      }

      const { data, error: rpcError } = await boundedRpc("mark_interested", {
        p_event_id: eventId,
      });

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setConfirmedStatus("interested");
      await joinSelectedCommunity(true);

      // Always cancel old scheduled reminders for this RSVP state.
      // If someone was promoted from waitlist, this request also notifies them.
      fetch("/api/notifications/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          promotedUserId: data?.promoted_user ?? null,
        }),
      }).catch(console.error);

      // Schedule reminders for interested users
      fetch("/api/notifications/interested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      }).catch(console.error);

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the update. Please try again.");
    } finally {
      interestedLock.current = false;
      setInterestedPending(false);
    }
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

      setConfirmedStatus(null);
      // Always cancel scheduled reminders for this user.
      // If someone was promoted, this request also sends the promotion notification.
      fetch("/api/notifications/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          promotedUserId: data?.promoted_user ?? null,
        }),
      }).catch(console.error);

      router.refresh();
    });
  }

  return {
    isPending,
    interestedPending,
    confirmedStatus,
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
  eventImageUrl: _eventImageUrl = null,
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

  const { isPending, interestedPending, confirmedStatus, error, handleRsvp, handleInterested, handleCancel, performRsvp, hasActiveQuestionnaire } =
    useRsvpActions(eventId, isLoggedIn, handleCelebrationTrigger, questionnaire, handleShowQuestionnaire, currentRsvp?.status);

  useEffect(() => {
    if (isLoggedIn && hasActiveQuestionnaire && !currentRsvp && !isEventPast(startsAt, endsAt) && new URLSearchParams(window.location.search).get("resumeRsvp") === "1") {
      setShowQuestionnaire(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("resumeRsvp");
      window.history.replaceState(null, "", url);
    }
  }, [isLoggedIn, hasActiveQuestionnaire, currentRsvp, startsAt, endsAt]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (isLoggedIn && currentRsvp?.status === "going" && url.searchParams.get("rsvpStatus") === "going") {
      url.searchParams.delete("rsvpStatus");
      window.history.replaceState(window.history.state, "", url);
      setShowCelebration(true);
      celebration.setCelebrating(true);
    }
  }, [isLoggedIn, currentRsvp?.status, celebration]);

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
  const status = confirmedStatus === undefined ? currentRsvp?.status : confirmedStatus;
  const isGoing = status === "going";
  const isWaitlist = status === "waitlist";
  const isInterested = status === "interested";

  // Render celebration portal (always rendered, controlled by showCelebration state)
  const celebrationPortal = showCelebration && (
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
            {isPending && !interestedPending ? "..." : t("cancelRsvp")}
          </Button>
          <button
            onClick={handleInterested}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {interestedPending ? <span className="inline-flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t("justInterested")}</span> : t("justInterested")}
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
            {isPending && !interestedPending ? "..." : t("leaveWaitlist")}
          </Button>
          <button
            onClick={handleInterested}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {interestedPending ? <span className="inline-flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t("justInterested")}</span> : t("justInterested")}
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
          <CommunityRsvpChoice />
          <Button
            onClick={handleRsvp}
            disabled={isPending}
            className="w-full"
          >
            {isPending && !interestedPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
          </Button>
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isPending && !interestedPending ? "..." : t("notInterested")}
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
        <CommunityRsvpChoice />
        <Button
          onClick={handleRsvp}
          disabled={isPending}
          className="w-full"
        >
          {isPending && !interestedPending ? "..." : isFull ? t("joinWaitlist") : t("imGoing")}
        </Button>
        <Button
          onClick={handleInterested}
          disabled={isPending}
          variant="outline"
          className="w-full"
        >
          {interestedPending ? <span className="inline-flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />{t("interested")}</span> : t("interested")}
        </Button>
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      </div>
    </>
  );
}
