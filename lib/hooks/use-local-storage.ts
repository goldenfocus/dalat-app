"use client";

import { useCallback, useSyncExternalStore } from "react";

// In-memory cache to sync state across hook instances
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, unknown>();

function subscribe(key: string, callback: () => void) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key)!.add(callback);
  return () => {
    listeners.get(key)?.delete(callback);
  };
}

function notifyListeners(key: string) {
  listeners.get(key)?.forEach((callback) => callback());
}

function getSnapshot<T>(key: string, defaultValue: T): T {
  if (cache.has(key)) {
    return cache.get(key) as T;
  }
  if (typeof window === "undefined") {
    return defaultValue;
  }
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = JSON.parse(stored) as T;
      cache.set(key, parsed);
      return parsed;
    }
  } catch {
    // Invalid JSON or localStorage not available
  }
  return defaultValue;
}

/**
 * Hook for persisting state in localStorage with SSR safety.
 * Uses useSyncExternalStore for instant cross-component sync.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    (callback) => subscribe(key, callback),
    () => getSnapshot(key, defaultValue),
    () => defaultValue
  );

  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      const currentValue = getSnapshot(key, defaultValue);
      const resolved =
        typeof newValue === "function"
          ? (newValue as (prev: T) => T)(currentValue)
          : newValue;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
        cache.set(key, resolved);
        notifyListeners(key);
      } catch {
        // localStorage full or not available
      }
    },
    [key, defaultValue]
  );

  return [value, setStoredValue];
}

// View mode types
export type EventViewMode = "grid" | "list" | "immersive";
export type EventDensity = "compact" | "default" | "spacious";

export interface EventViewPreferences {
  mode: EventViewMode;
  density: EventDensity;
}

const DEFAULT_PREFERENCES: EventViewPreferences = {
  mode: "grid",
  density: "default",
};

/**
 * Hook specifically for event view preferences.
 * Provides typed access to view mode and density settings.
 */
export function useEventViewPreferences() {
  const [preferences, setPreferences] = useLocalStorage<EventViewPreferences>(
    "dalat-event-view",
    DEFAULT_PREFERENCES
  );

  const setMode = useCallback(
    (mode: EventViewMode) => {
      setPreferences((prev) => ({ ...prev, mode }));
    },
    [setPreferences]
  );

  const setDensity = useCallback(
    (density: EventDensity) => {
      setPreferences((prev) => ({ ...prev, density }));
    },
    [setPreferences]
  );

  return {
    mode: preferences.mode,
    density: preferences.density,
    setMode,
    setDensity,
    setPreferences,
  };
}
