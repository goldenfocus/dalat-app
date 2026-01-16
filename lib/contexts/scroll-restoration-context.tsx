"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";

interface ScrollRestorationState {
  eventFeedIndex: number;
  eventFeedTab: string;
}

interface ScrollRestorationContextType {
  saveEventFeedPosition: (index: number, tab: string) => void;
  getEventFeedPosition: () => ScrollRestorationState | null;
  clearEventFeedPosition: () => void;
}

const STORAGE_KEY = "dalat-scroll-restoration";

const ScrollRestorationContext =
  createContext<ScrollRestorationContextType | null>(null);

export function ScrollRestorationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const saveEventFeedPosition = useCallback((index: number, tab: string) => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ eventFeedIndex: index, eventFeedTab: tab })
      );
    } catch {
      // sessionStorage not available (SSR or private browsing)
    }
  }, []);

  const getEventFeedPosition = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const clearEventFeedPosition = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // sessionStorage not available
    }
  }, []);

  return (
    <ScrollRestorationContext.Provider
      value={{
        saveEventFeedPosition,
        getEventFeedPosition,
        clearEventFeedPosition,
      }}
    >
      {children}
    </ScrollRestorationContext.Provider>
  );
}

export function useScrollRestoration() {
  const context = useContext(ScrollRestorationContext);
  if (!context) {
    throw new Error(
      "useScrollRestoration must be used within ScrollRestorationProvider"
    );
  }
  return context;
}
