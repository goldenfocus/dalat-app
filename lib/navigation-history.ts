// The Navigation API exposes only traversable same-origin entries. Older
// browsers get the same controls for client-side history created by the app.
const ENTRY_KEY = "__dalatHistoryEntry";
const BACK = 1;
const FORWARD = 2;

type AppEntry = { index: number; key: string };
type BrowserNavigation = EventTarget & {
  canGoBack: boolean;
  canGoForward: boolean;
  currentEntry: { key: string } | null;
};

function getNavigation() {
  return (window as Window & { navigation?: BrowserNavigation }).navigation;
}

let fallbackStarted = false;
let lastIndex = 0;

function getFallbackEntry(): AppEntry | undefined {
  return window.history.state?.[ENTRY_KEY];
}

function startFallback() {
  if (fallbackStarted) return;
  fallbackStarted = true;

  const history = window.history;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  const initial = getFallbackEntry() ?? { index: 0, key: crypto.randomUUID() };
  lastIndex = initial.index;
  replaceState({ ...history.state, [ENTRY_KEY]: initial }, "");

  history.pushState = (state, unused, url) => {
    const index = (getFallbackEntry()?.index ?? 0) + 1;
    pushState({ ...state, [ENTRY_KEY]: { index, key: crypto.randomUUID() } }, unused, url);
    lastIndex = index;
    window.dispatchEvent(new Event("dalat-history-change"));
  };

  history.replaceState = (state, unused, url) => {
    const entry = getFallbackEntry() ?? { index: 0, key: crypto.randomUUID() };
    replaceState({ ...state, [ENTRY_KEY]: entry }, unused, url);
  };
}

export function subscribeToAppHistory(onChange: () => void) {
  // Next writes history during an insertion effect. Notify React after the commit.
  const notify = () => queueMicrotask(onChange);
  const navigation = getNavigation();
  if (navigation) {
    navigation.addEventListener("currententrychange", notify);
    return () => navigation.removeEventListener("currententrychange", notify);
  }

  startFallback();
  window.addEventListener("dalat-history-change", notify);
  window.addEventListener("popstate", notify);
  return () => {
    window.removeEventListener("dalat-history-change", notify);
    window.removeEventListener("popstate", notify);
  };
}

export function getAppHistoryDirections(): number {
  const navigation = getNavigation();
  if (navigation) {
    return (navigation.canGoBack ? BACK : 0) | (navigation.canGoForward ? FORWARD : 0);
  }

  const current = getFallbackEntry();
  if (!current) return 0;
  return (current.index > 0 ? BACK : 0) | (current.index < lastIndex ? FORWARD : 0);
}

export function getAppHistoryEntryKey(): string | undefined {
  const navigation = getNavigation();
  if (navigation) return navigation.currentEntry?.key;
  return getFallbackEntry()?.key;
}

// Keep per-entry UI state through a full document traversal or reload.
const entryValues = new Map<string, string>();

export function readHistoryEntryValue(entry: string, field: string): string | undefined {
  const key = `dalat-history:${entry}:${field}`;
  const value = entryValues.get(key);
  if (value !== undefined) return value;
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveHistoryEntryValue(entry: string, field: string, value: string) {
  const key = `dalat-history:${entry}:${field}`;
  if (entryValues.get(key) === value) return;
  entryValues.set(key, value);
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // The in-memory value still works for client-side navigation.
  }
}

export { BACK, FORWARD };
