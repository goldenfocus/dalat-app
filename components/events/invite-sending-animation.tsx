"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { MatrixText } from "@/components/ui/matrix-text";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Invitee =
  | { type: "email"; email: string; name?: string }
  | { type: "user"; user: UserSearchResult };

interface InviteResult {
  email?: string;
  userId?: string;
  success: boolean;
  error?: string;
}

type InviteeStatus = "waiting" | "decoding" | "sending" | "success" | "failed";

interface InviteSendingAnimationProps {
  invitees: Invitee[];
  results: InviteResult[] | null;
  onAnimationComplete?: () => void;
}

export function InviteSendingAnimation({
  invitees,
  results,
  onAnimationComplete,
}: InviteSendingAnimationProps) {
  const [statuses, setStatuses] = useState<InviteeStatus[]>(
    invitees.map(() => "waiting")
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  // Get display text for an invitee
  const getInviteeText = useCallback((invitee: Invitee): string => {
    if (invitee.type === "email") {
      return invitee.email;
    }
    return `@${invitee.user.username}`;
  }, []);

  // Start animation sequence
  useEffect(() => {
    if (invitees.length === 0) return;

    // Initial delay before starting
    const startTimeout = setTimeout(() => {
      setStatuses((prev) => {
        const next = [...prev];
        next[0] = "decoding";
        return next;
      });
    }, 300);

    return () => clearTimeout(startTimeout);
  }, [invitees.length]);

  // Progress through each invitee
  useEffect(() => {
    if (currentIndex >= invitees.length) return;
    if (statuses[currentIndex] !== "decoding") return;

    // After decode completes (500ms), move to sending
    const sendingTimeout = setTimeout(() => {
      setStatuses((prev) => {
        const next = [...prev];
        next[currentIndex] = "sending";
        return next;
      });
    }, 600);

    return () => clearTimeout(sendingTimeout);
  }, [currentIndex, invitees.length, statuses]);

  // After sending state, move to next or wait for results
  useEffect(() => {
    if (currentIndex >= invitees.length) return;
    if (statuses[currentIndex] !== "sending") return;

    // After 1 second of "sending", either show success (optimistic) or move to next
    const nextTimeout = setTimeout(() => {
      // If we have results, use them; otherwise show optimistic success
      if (results) {
        const invitee = invitees[currentIndex];
        const result = results.find((r) =>
          invitee.type === "email"
            ? r.email === invitee.email
            : r.userId === invitee.user.id
        );
        setStatuses((prev) => {
          const next = [...prev];
          next[currentIndex] = result?.success !== false ? "success" : "failed";
          return next;
        });
      } else {
        // Optimistic - show success while waiting for API
        setStatuses((prev) => {
          const next = [...prev];
          next[currentIndex] = "success";
          return next;
        });
      }

      // Move to next invitee
      if (currentIndex < invitees.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setStatuses((prev) => {
          const next = [...prev];
          next[currentIndex + 1] = "decoding";
          return next;
        });
      }
    }, 800);

    return () => clearTimeout(nextTimeout);
  }, [currentIndex, invitees, statuses, results]);

  // When results arrive, reconcile statuses and show summary
  useEffect(() => {
    if (!results) return;

    // Update any optimistic statuses with real results
    setStatuses((prev) => {
      const next = [...prev];
      invitees.forEach((invitee, index) => {
        if (next[index] === "success" || next[index] === "failed") {
          const result = results.find((r) =>
            invitee.type === "email"
              ? r.email === invitee.email
              : r.userId === invitee.user.id
          );
          next[index] = result?.success !== false ? "success" : "failed";
        }
      });
      return next;
    });

    // Show summary after a short delay
    const summaryTimeout = setTimeout(() => {
      setShowSummary(true);

      // Fire confetti if any successes
      const successCount = results.filter((r) => r.success).length;
      if (successCount > 0) {
        confetti({
          particleCount: successCount * 30,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#00ff41", "#00cc33", "#009926"],
        });
      }

      onAnimationComplete?.();
    }, 500);

    return () => clearTimeout(summaryTimeout);
  }, [results, invitees, onAnimationComplete]);

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failedCount = results ? results.length - successCount : 0;

  return (
    <div className="relative min-h-[300px] flex flex-col">
      {/* Matrix-style background overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/90 via-emerald-950/20 to-black/90 rounded-lg" />

      {/* Falling characters effect (CSS-based, subtle) */}
      <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
        <div className="matrix-rain" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 p-6 space-y-4">
        {/* Header */}
        <div className="text-center mb-4">
          <h3 className="text-lg font-mono text-[#00ff41] tracking-wider">
            {showSummary ? "TRANSMISSION COMPLETE" : "TRANSMITTING..."}
          </h3>
        </div>

        {/* Invitee list */}
        <div className="w-full max-w-sm space-y-3">
          {invitees.map((invitee, index) => {
            const status = statuses[index];
            const text = getInviteeText(invitee);

            return (
              <div
                key={invitee.type === "email" ? invitee.email : invitee.user.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-500",
                  status === "waiting" && "opacity-30",
                  status === "decoding" && "opacity-100 bg-[#00ff41]/5",
                  status === "sending" && "opacity-100 bg-[#00ff41]/10",
                  status === "success" && "opacity-100 bg-[#00ff41]/10",
                  status === "failed" && "opacity-100 bg-red-500/10"
                )}
              >
                {/* Status icon */}
                <div className="w-5 h-5 flex items-center justify-center">
                  {status === "waiting" && (
                    <span className="text-gray-600">○</span>
                  )}
                  {status === "decoding" && (
                    <span className="text-[#00ff41] animate-pulse">◉</span>
                  )}
                  {status === "sending" && (
                    <Loader2 className="w-4 h-4 text-[#00ff41] animate-spin" />
                  )}
                  {status === "success" && (
                    <Check className="w-4 h-4 text-[#00ff41] animate-in zoom-in-50 duration-300" />
                  )}
                  {status === "failed" && (
                    <X className="w-4 h-4 text-red-500 animate-in zoom-in-50 duration-300" />
                  )}
                </div>

                {/* Email/username text */}
                <div className="flex-1 min-w-0">
                  <MatrixText
                    text={text}
                    isDecoding={status === "decoding"}
                    className={cn(
                      "text-sm truncate block",
                      status === "waiting" && "text-gray-500",
                      status === "success" && "text-[#00ff41]",
                      status === "failed" && "text-red-400"
                    )}
                    decodeDuration={500}
                  />
                </div>

                {/* Glow effect for active/success */}
                {(status === "decoding" || status === "sending" || status === "success") && (
                  <div
                    className={cn(
                      "absolute inset-0 rounded-lg pointer-events-none",
                      status === "success"
                        ? "shadow-[0_0_15px_rgba(0,255,65,0.3)]"
                        : "shadow-[0_0_10px_rgba(0,255,65,0.15)]"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {showSummary && results && (
          <div className="mt-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <p className="text-[#00ff41] font-mono text-lg">
              {successCount} sent successfully
              {failedCount > 0 && (
                <span className="text-red-400 ml-2">
                  · {failedCount} failed
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* CSS for matrix rain effect */}
      <style jsx>{`
        .matrix-rain {
          background: linear-gradient(
            180deg,
            transparent,
            rgba(0, 255, 65, 0.03) 50%,
            transparent
          );
          background-size: 100% 20px;
          animation: rain 2s linear infinite;
        }
        @keyframes rain {
          0% {
            background-position: 0 -100%;
          }
          100% {
            background-position: 0 100%;
          }
        }
      `}</style>
    </div>
  );
}
