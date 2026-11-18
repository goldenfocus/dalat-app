"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Hand } from "lucide-react";
import { useTranslations } from "next-intl";

const HINT_STORAGE_KEY = "dalat-cinema-hint-seen";
const HINT_DURATION_MS = 3000;

function hasSeenHint(): boolean {
  try {
    return localStorage.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    // Storage blocked: stay quiet rather than nag on every visit.
    return true;
  }
}

function markHintSeen() {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

/**
 * One-time "how it works" hint. Shows on the very first cinema visit, goes
 * away on the first tap or after 3s, and is never shown again.
 * `shouldDismiss` flips true when the viewer has interacted (chrome revealed).
 */
export function useFirstVisitHint(shouldDismiss: boolean) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasSeenHint()) return;
    markHintSeen();
    setVisible(true);
    const id = setTimeout(() => setVisible(false), HINT_DURATION_MS);
    return () => clearTimeout(id);
  }, []);

  // Dismiss on the first reveal that follows the chrome being hidden.
  const sawHiddenRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    if (!shouldDismiss) sawHiddenRef.current = true;
    else if (sawHiddenRef.current) setVisible(false);
  }, [shouldDismiss, visible]);

  return visible;
}

export function CinemaFirstVisitHint({ visible }: { visible: boolean }) {
  const t = useTranslations("moments.cinemaControls");
  const [mounted, setMounted] = useState(visible);

  const handleEnd = useCallback(() => {
    if (!visible) setMounted(false);
  }, [visible]);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={handleEnd}
      className={
        "pointer-events-none absolute inset-x-0 bottom-[max(6rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-6 " +
        "transition-opacity duration-300 motion-reduce:transition-none " +
        (visible ? "opacity-100" : "opacity-0")
      }
    >
      <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-md">
        <Hand className="h-4 w-4 shrink-0" />
        <span>{t("hint")}</span>
      </div>
    </div>
  );
}
