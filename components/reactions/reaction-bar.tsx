"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SmilePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  REACTION_EMOJI,
  REACTION_GLYPH,
  REACTION_LABEL_KEY,
  type ReactionCounts,
  type ReactionEmoji,
  type ReactionTargetType,
} from "@/lib/reactions";
import { useTargetReactions } from "@/lib/hooks/use-reactions";

interface ReactionBarProps {
  targetType: ReactionTargetType;
  targetId: string;
  /** When false, interacting routes to sign-in instead of calling the RPC */
  isAuthenticated?: boolean;
  /**
   * Pre-fetched counts. Pass these from a parent that already batch-loaded a
   * list (e.g. a comment thread) so each row doesn't issue its own query.
   * Omit for one-at-a-time surfaces and the bar fetches its own.
   */
  counts?: ReactionCounts;
  /** "overlay" for dark media surfaces, "inline" for normal page backgrounds */
  variant?: "overlay" | "inline";
  /** "vertical" fits the narrow action rail on the fullscreen feed */
  orientation?: "horizontal" | "vertical";
  /** Where to return after sign-in */
  returnTo?: string;
  className?: string;
}

interface ToggleResult {
  ok: boolean;
  target_id: string;
  emoji: ReactionEmoji;
  reacted: boolean;
  counts: Partial<Record<ReactionEmoji, number>>;
}

/**
 * Emoji reaction row, usable on any reactable target (moments, comments).
 *
 * Renders a chip per emoji that has at least one reaction, plus a picker to add
 * a new one. A user may react with several different emoji; tapping their own
 * reaction removes it.
 */
export function ReactionBar({
  targetType,
  targetId,
  isAuthenticated = false,
  counts: providedCounts,
  variant = "inline",
  orientation = "horizontal",
  returnTo,
  className,
}: ReactionBarProps) {
  const t = useTranslations("reactions");
  const router = useRouter();
  const pickerRef = useRef<HTMLDivElement>(null);

  // Only self-fetch when the parent didn't already batch-load for us.
  const { counts: fetchedCounts } = useTargetReactions(
    targetType,
    providedCounts ? undefined : targetId
  );

  const [counts, setCounts] = useState<ReactionCounts>(providedCounts ?? {});
  const [pickerOpen, setPickerOpen] = useState(false);

  // Adopt whichever source is authoritative once it arrives.
  useEffect(() => {
    if (providedCounts) setCounts(providedCounts);
  }, [providedCounts]);
  useEffect(() => {
    if (!providedCounts && fetchedCounts && Object.keys(fetchedCounts).length > 0) {
      setCounts(fetchedCounts);
    }
  }, [providedCounts, fetchedCounts]);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const react = async (emoji: ReactionEmoji, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setPickerOpen(false);

    if (!isAuthenticated) {
      const next = returnTo ?? (typeof window !== "undefined" ? window.location.pathname : "/");
      router.push(`/auth/login?next=${encodeURIComponent(next)}`);
      return;
    }

    triggerHaptic("selection");

    const prev = counts;
    const current = counts[emoji];
    const wasReacted = current?.reacted ?? false;
    const nextCount = Math.max(0, (current?.count ?? 0) + (wasReacted ? -1 : 1));

    setCounts({
      ...counts,
      [emoji]: { count: nextCount, reacted: !wasReacted },
    });

    const supabase = createClient();
    const { data, error } = await supabase.rpc("toggle_reaction", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_emoji: emoji,
    });

    if (error) {
      console.error("toggle_reaction failed:", error.message, error);
      setCounts(prev);
      triggerHaptic("error");
      return;
    }

    // The RPC returns authoritative totals for every emoji on this target.
    const result = data as unknown as ToggleResult;
    const reconciled: ReactionCounts = {};
    for (const key of REACTION_EMOJI) {
      const n = Number(result.counts?.[key] ?? 0);
      if (n > 0) {
        reconciled[key] = {
          count: n,
          reacted: key === emoji ? result.reacted : (counts[key]?.reacted ?? false),
        };
      }
    }
    setCounts(reconciled);
    triggerHaptic(result.reacted ? "success" : "light");
  };

  const overlay = variant === "overlay";
  const active = REACTION_EMOJI.filter((e) => (counts[e]?.count ?? 0) > 0);

  const chipBase = cn(
    "inline-flex items-center gap-1 rounded-full text-sm leading-none transition-all active:scale-95",
    "px-2.5 py-2 min-h-[36px]",
    overlay
      ? "bg-black/40 backdrop-blur-sm text-white hover:bg-black/55"
      : "bg-muted text-foreground hover:bg-muted/70"
  );
  const chipOn = overlay
    ? "ring-1 ring-white/70 bg-black/60"
    : "ring-1 ring-primary/60 bg-primary/10";

  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5",
        orientation === "vertical" ? "flex-col" : "flex-wrap",
        className
      )}
    >
      {active.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => react(emoji, e)}
          className={cn(chipBase, counts[emoji]?.reacted && chipOn)}
          aria-label={t(REACTION_LABEL_KEY[emoji])}
          aria-pressed={counts[emoji]?.reacted ?? false}
        >
          <span aria-hidden>{REACTION_GLYPH[emoji]}</span>
          <span className="font-medium tabular-nums">{counts[emoji]?.count}</span>
        </button>
      ))}

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPickerOpen((o) => !o);
        }}
        className={cn(chipBase, "px-2")}
        aria-label={t("addReaction")}
        aria-expanded={pickerOpen}
      >
        <SmilePlus className="w-4 h-4" />
      </button>

      {pickerOpen && (
        <div
          ref={pickerRef}
          role="menu"
          className={cn(
            "absolute bottom-full mb-2 z-50 flex items-center gap-0.5 rounded-full p-1 shadow-lg",
            // The vertical rail sits against the right edge of the viewport, so
            // anchoring the picker left would push it off-screen.
            orientation === "vertical" ? "right-0" : "left-0",
            overlay
              ? "bg-black/80 backdrop-blur-md ring-1 ring-white/15"
              : "bg-popover ring-1 ring-border"
          )}
        >
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              role="menuitem"
              onClick={(e) => react(emoji, e)}
              className={cn(
                "w-11 h-11 rounded-full text-xl flex items-center justify-center transition-transform",
                "hover:scale-125 active:scale-95",
                overlay ? "hover:bg-white/10" : "hover:bg-muted"
              )}
              aria-label={t(REACTION_LABEL_KEY[emoji])}
            >
              <span aria-hidden>{REACTION_GLYPH[emoji]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
