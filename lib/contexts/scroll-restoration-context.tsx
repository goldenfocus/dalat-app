"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { getAppHistoryEntryKey } from "@/lib/navigation-history";

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

interface PendingScroll {
  entry: string;
  pathname: string;
  top: number;
}

function useHistoryScrollRestoration() {
  const pathname = usePathname();
  const positions = useRef(new Map<string, number>());
  const pending = useRef<PendingScroll | undefined>(undefined);
  const [restore, setRestore] = useState<PendingScroll>();

  useEffect(() => {
    function savePosition() {
      const entry = getAppHistoryEntryKey();
      if (entry && pending.current?.entry !== entry) {
        positions.current.set(entry, window.scrollY);
      }
    }

    function handleTraversal() {
      const entry = getAppHistoryEntryKey();
      const top = entry ? positions.current.get(entry) : undefined;
      pending.current = entry && top !== undefined
        ? { entry, pathname: window.location.pathname, top }
        : undefined;
      setRestore(pending.current);
    }

    window.addEventListener("scroll", savePosition, { passive: true });
    document.addEventListener("click", savePosition, true);
    window.addEventListener("popstate", handleTraversal, true);
    return () => {
      window.removeEventListener("scroll", savePosition);
      document.removeEventListener("click", savePosition, true);
      window.removeEventListener("popstate", handleTraversal, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!restore || restore.pathname !== pathname) return;
    const frame = requestAnimationFrame(() => {
      if (getAppHistoryEntryKey() === restore.entry) {
        window.scrollTo({ top: restore.top, behavior: "instant" });
      }
      if (pending.current === restore) pending.current = undefined;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, restore]);
}

export function ScrollRestorationProvider({
  children,
}: {
  children: ReactNode;
}) {
  useHistoryScrollRestoration();

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
