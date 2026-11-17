"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isMomentUploadActive } from "@/lib/uploads/activity";
import { isArrivalWorkspacePath } from "@/lib/arrival/navigation";

export const LIVE_DATA_REFRESH_INTERVAL_MS = 60_000;
export const LIVE_DATA_REFRESH_THROTTLE_MS = 10_000;
/** Routes rendered per request re-fetch no more often than cached pages regenerate. */
export const UNCACHED_ROUTE_REFRESH_MS = 300_000;
const PROBE_TIMEOUT_MS = 4_000;
/** `Age` is whole seconds; lean towards refreshing when the two times are this close. */
const AGE_TOLERANCE_MS = 2_000;

const NON_REFRESHABLE_EVENT_ROUTES =
  /\/(?:new|edit|settings|moderation|responses|checkin|reconfirmation|questionnaire|broadcast|pro-upload|download)(?:\/|$)/;

/**
 * Pages whose visible state can become wrong just because time passed or an
 * event changed. Avoid background/editor routes so a refresh never interrupts
 * an in-progress form.
 */
export function isLiveDataPath(pathname: string): boolean {
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  if (NON_REFRESHABLE_EVENT_ROUTES.test(path) || isArrivalWorkspacePath(path)) return false;

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
 * A body-less request for this route's payload. It proves the connection works
 * right now and, for prerendered routes, reports how old the server's copy is
 * (`null` for routes rendered per request).
 */
async function probeRoute(): Promise<{ reachable: boolean; ageMs: number | null }> {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("_rsc", "fresh");
    const response = await fetch(url, {
      method: "HEAD",
      headers: { RSC: "1" },
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return { reachable: false, ageMs: null };
    const age = Number(response.headers.get("age") ?? NaN);
    const prerendered = response.headers.get("x-nextjs-prerender") === "1";
    return { reachable: true, ageMs: prerendered && Number.isFinite(age) ? age * 1000 : null };
  } catch {
    return { reachable: false, ageMs: null };
  }
}

/**
 * Keeps time-sensitive screens fresh without a disruptive full-page reload.
 *
 * - Refreshes an installed PWA shortly after launch (cached HTML can boot fast).
 * - Refreshes when a suspended tab/PWA becomes visible again.
 * - Refreshes when connectivity returns.
 * - Checks once a minute while visible so lifecycle changes that have no DB
 *   write (upcoming -> happening -> past) still appear automatically.
 *
 * Every check starts with a probe, and the route is re-fetched only when the
 * probe succeeds and the server holds something newer. A re-fetch that dies
 * mid-stream replaces the whole app with an error screen, and re-downloading
 * an unchanged page every minute costs a phone ~200KB and a full re-render.
 */
export function AppFreshnessHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefreshAt = useRef(0);
  const didScheduleInitialPwaRefresh = useRef(false);
  const wasHidden = useRef(
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );

  // When the content on screen was last known to match the server; `null`
  // after a client navigation, which may have painted a prefetched copy.
  const syncedAt = useRef<number | null>(null);
  const isUncachedRoute = useRef(false);
  const probing = useRef(false);
  const isFirstPath = useRef(true);

  useEffect(() => {
    // The first path is the document the server just sent.
    syncedAt.current = isFirstPath.current ? Date.now() : null;
    isFirstPath.current = false;
    isUncachedRoute.current = false;
  }, [pathname]);

  const refresh = useCallback(
    async (force = false, uploadFinished = false) => {
      if (!isLiveDataPath(pathname) || document.visibilityState !== "visible" || (isMomentUploadActive() && !uploadFinished)) {
        return;
      }
      if (navigator.onLine === false || probing.current) return;

      const now = Date.now();
      if (!force && now - lastRefreshAt.current < LIVE_DATA_REFRESH_THROTTLE_MS) {
        return;
      }

      const mustRefresh = force || uploadFinished || syncedAt.current === null;
      const sinceSync = now - (syncedAt.current ?? 0);
      if (!mustRefresh && isUncachedRoute.current && sinceSync < UNCACHED_ROUTE_REFRESH_MS) return;

      probing.current = true;
      const { reachable, ageMs } = await probeRoute();
      probing.current = false;
      // The visitor may have moved on while the probe was in flight.
      if (!reachable || window.location.pathname !== pathname || document.visibilityState !== "visible") return;

      isUncachedRoute.current = ageMs === null;
      if (!mustRefresh) {
        if (ageMs === null ? sinceSync < UNCACHED_ROUTE_REFRESH_MS : ageMs > sinceSync + AGE_TOLERANCE_MS) return;
      }

      lastRefreshAt.current = syncedAt.current = Date.now();
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
        void refresh();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A page restored from the back/forward cache can be any age.
      syncedAt.current = null;
      void refresh();
    };

    const handleOnline = () => void refresh();
    // A completed file is safe to render; the engine lives outside this route.
    // This never refreshes the composer and is throttled for large batches.
    const handleMomentAdded = () => void refresh(false, true);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);
    window.addEventListener("dalat:moment-added", handleMomentAdded);

    const interval = window.setInterval(() => {
      void refresh();
    }, LIVE_DATA_REFRESH_INTERVAL_MS);

    // Installed PWAs may start from the service worker's cached shell. Let the
    // first paint stay instant, then reconcile it with current server data.
    const shouldRefreshAfterPwaLaunch =
      !didScheduleInitialPwaRefresh.current && isStandalonePwa();
    didScheduleInitialPwaRefresh.current = true;
    const initialPwaRefresh = shouldRefreshAfterPwaLaunch
      ? window.setTimeout(() => void refresh(true), 1_000)
      : null;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("dalat:moment-added", handleMomentAdded);
      window.clearInterval(interval);
      if (initialPwaRefresh !== null) window.clearTimeout(initialPwaRefresh);
    };
  }, [refresh]);

  return null;
}
