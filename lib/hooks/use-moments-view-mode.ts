"use client";

import { useState, useEffect, useCallback } from "react";

export type MomentsViewMode = "grid" | "immersive";

const STORAGE_KEY = "dalat-moments-view-mode";

/**
 * Hook to manage and persist the user's preferred moments view mode.
 * Stores preference in localStorage so it persists across sessions.
 */
export function useMomentsViewMode(defaultMode: MomentsViewMode = "grid") {
  const [viewMode, setViewModeState] = useState<MomentsViewMode>(defaultMode);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "grid" || stored === "immersive") {
        setViewModeState(stored);
      }
    } catch {
      // localStorage not available
    }
    setIsLoaded(true);
  }, []);

  // Persist to localStorage when changed
  const setViewMode = useCallback((mode: MomentsViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage not available
    }
  }, []);

  // Toggle between modes
  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === "grid" ? "immersive" : "grid");
  }, [viewMode, setViewMode]);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    isLoaded,
  };
}
