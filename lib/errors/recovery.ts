/**
 * Shared recovery policy for render errors.
 *
 * Most render errors in production are not bugs in the page: a navigation or
 * background refresh lost its connection mid-stream, or this tab outlived the
 * build it was loaded from. Both heal without the visitor doing anything, so
 * the error boundaries try that before showing an error screen.
 */

export interface ErrorLabels {
  title: string;
  description: string;
  tryAgain: string;
  refreshPage: string;
}

const RELOAD_KEY = "dalat:recovery-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;
const RETRY_COOLDOWN_MS = 30_000;
/** Lets a connection that just came back settle before it is used. */
const SETTLE_MS = 1_000;

let lastRetryAt = 0;
let labels: ErrorLabels | null = null;

/**
 * The locale layout's boundary registers its translated labels here, so the
 * root error screens (which render outside the i18n provider) can reuse them.
 */
export const rememberErrorLabels = (next: ErrorLabels) => {
  labels = next;
};
export const recallErrorLabels = () => labels;

/** This tab's JavaScript no longer matches what the server is serving. */
export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    /Failed to load chunk|Loading (?:CSS )?chunk \S+ failed|dynamically imported module|Importing a module script failed/i.test(
      error.message
    )
  );
}

/** Whether the once-a-minute full reload is still available. */
export function canReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    return Date.now() - last >= RELOAD_COOLDOWN_MS;
  } catch {
    // Without storage there is no loop guard, so leave the reload to the visitor.
    return false;
  }
}

/** Full reload, at most once a minute so a broken build can never loop. */
export function reloadOnce(): boolean {
  if (!canReload()) return false;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

export type RecoveryPlan = "reload" | "retry" | "manual";
/** Long enough for Strict Mode's double render, far shorter than any retry. */
const SAME_RENDER_MS = 250;
const recent = new WeakMap<object, { plan: RecoveryPlan; at: number }>();

/**
 * - "reload": stale build; the caller should `reloadOnce()`.
 * - "retry": re-fetch and re-render once the network is reachable.
 * - "manual": the automatic attempt was just used; show the error screen.
 *
 * Asking again for the same error within the same render returns the same
 * plan, so a double render does not spend the automatic attempt. The same
 * error coming back after a retry is planned afresh and ends in "manual".
 */
export function planRecovery(error: unknown): RecoveryPlan {
  if (typeof window === "undefined") return "retry";
  const now = Date.now();
  const key = typeof error === "object" && error !== null ? error : null;
  const last = key && recent.get(key);
  if (last && now - last.at < SAME_RENDER_MS) return last.plan;

  let plan: RecoveryPlan;
  if (isStaleBuildError(error)) {
    plan = canReload() ? "reload" : "manual";
  } else if (now - lastRetryAt < RETRY_COOLDOWN_MS) {
    plan = "manual";
  } else {
    lastRetryAt = now;
    plan = "retry";
  }
  if (key) recent.set(key, { plan, at: now });
  return plan;
}

/** Resolves once the browser is online and the tab is visible. */
export function whenReachable(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(signal.reason);
    };
    function check() {
      clearTimeout(timer);
      if (navigator.onLine === false || document.visibilityState !== "visible") return;
      timer = setTimeout(() => {
        stop();
        resolve();
      }, SETTLE_MS);
    }
    if (signal.aborted) return abort();
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    signal.addEventListener("abort", abort);
    check();
  });
}

/** Test seam: forget the last automatic retry. */
export function resetRecoveryForTests() {
  lastRetryAt = 0;
  labels = null;
}
