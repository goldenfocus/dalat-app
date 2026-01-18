"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { triggerHaptic, type HapticStyle } from "@/lib/haptics";

interface UsePendingNavigationOptions {
  haptic?: HapticStyle;
}

/**
 * Hook for handling navigation with pending state and haptic feedback.
 * Use this for cards, list items, or any clickable elements that navigate.
 *
 * Returns isPending flag that you can use to show loading UI.
 */
export function usePendingNavigation(options: UsePendingNavigationOptions = {}) {
  const { haptic = "selection" } = options;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  const navigate = useCallback(
    (href: string, opts?: { replace?: boolean }) => {
      // Immediate haptic feedback
      triggerHaptic(haptic);
      setIsNavigating(true);

      startTransition(() => {
        if (opts?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      });
    },
    [router, haptic]
  );

  // Combined pending state (either in transition or navigating)
  const pending = isPending || isNavigating;

  // Reset navigating state when transition ends
  if (!isPending && isNavigating) {
    setIsNavigating(false);
  }

  return {
    navigate,
    isPending: pending,
  };
}

/**
 * Simpler version that just provides isPending state for Link components.
 * Use with onClick to set pending state.
 */
export function useLinkPending() {
  const [isPending, setIsPending] = useState(false);

  const handleClick = useCallback(() => {
    triggerHaptic("selection");
    setIsPending(true);
    // Reset after a short delay if navigation doesn't happen
    setTimeout(() => setIsPending(false), 3000);
  }, []);

  return {
    isPending,
    handleClick,
    linkProps: {
      onClick: handleClick,
      "aria-busy": isPending,
    },
  };
}
