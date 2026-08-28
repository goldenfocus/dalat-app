"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

export const LIVE_DATA_REFRESH_INTERVAL_MS = 60_000;
export const LIVE_DATA_REFRESH_THROTTLE_MS = 10_000;

const NON_REFRESHABLE_EVENT_ROUTES =
  /\/(?:new|edit|settings|moderation|responses|checkin|reconfirmation|questionnaire|broadcast|pro-upload|download)(?:\/|$)/;

/**
 * Pages whose visible state can become wrong just because time passed or an
 * event changed. Avoid background/editor routes so a refresh never interrupts
 * an in-progress form.
 */
export function isLiveDataPath(pathname: string): boolean {
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  if (NON_REFRESHABLE_EVENT_ROUTES.test(path)) return false;

  return (
    path === "/" ||
    /^\/(?:events|venues|map|calendar|tonight|this-weekend|search)(?:\/|$)/.test(
      path
    )
  );
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/**
 * Keeps time-sensitive screens fresh without a disruptive full-page reload.
 *
 * - Refreshes an installed PWA shortly after launch (cached HTML can boot fast).
 * - Refreshes when a suspended tab/PWA becomes visible again.
 * - Refreshes when connectivity returns.
 * - Refreshes once a minute while visible so lifecycle changes that have no DB
 *   write (upcoming -> happening -> past) still appear automatically.
 */
export function AppFreshnessHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefreshAt = useRef(0);
  const didScheduleInitialPwaRefresh = useRef(false);
  const wasHidden = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );

  const refresh = useCallback(
    (force = false) => {
      if (!isLiveDataPath(pathname) || document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (!force && now - lastRefreshAt.current < LIVE_DATA_REFRESH_THROTTLE_MS) {
        return;
      }

      lastRefreshAt.current = now;
      router.refresh();
    },
    [pathname, router]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHidden.current = true;
        return;
      }

      if (wasHidden.current) {
        wasHidden.current = false;
        refresh();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };

    const handleOnline = () => refresh();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);

    const interval = window.setInterval(() => {
      refresh();
    }, LIVE_DATA_REFRESH_INTERVAL_MS);

    // Installed PWAs may start from the service worker's cached shell. Let the
    // first paint stay instant, then reconcile it with current server data.
    const shouldRefreshAfterPwaLaunch =
      !didScheduleInitialPwaRefresh.current && isStandalonePwa();
    didScheduleInitialPwaRefresh.current = true;
    const initialPwaRefresh = shouldRefreshAfterPwaLaunch
      ? window.setTimeout(() => refresh(true), 1_000)
      : null;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
      window.clearInterval(interval);
      if (initialPwaRefresh !== null) window.clearTimeout(initialPwaRefresh);
    };
  }, [refresh]);

  return null;
}
