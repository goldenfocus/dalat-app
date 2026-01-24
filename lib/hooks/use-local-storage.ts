"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook for persisting state in localStorage with SSR safety.
 * Returns the stored value and a setter function.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  // Initialize with default to avoid hydration mismatch
  const [value, setValue] = useState<T>(defaultValue);

  // Load from localStorage after hydration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        setValue(JSON.parse(stored));
      }
    } catch {
      // Invalid JSON or localStorage not available
    }
  }, [key]);

  // Persist to localStorage when value changes (after hydration)
  const setStoredValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof newValue === "function"
          ? (newValue as (prev: T) => T)(prev)
          : newValue;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // localStorage full or not available
        }
        return resolved;
      });
    },
    [key]
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
