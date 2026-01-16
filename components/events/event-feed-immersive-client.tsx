"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useScrollRestoration } from "@/lib/contexts/scroll-restoration-context";

interface EventFeedImmersiveClientProps {
  children: ReactNode;
  eventCount: number;
  activeTab: string;
}

export function EventFeedImmersiveClient({
  children,
  eventCount,
  activeTab,
}: EventFeedImmersiveClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { saveEventFeedPosition, getEventFeedPosition, clearEventFeedPosition } =
    useScrollRestoration();
  const hasRestoredRef = useRef(false);

  // Restore scroll position on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const savedPosition = getEventFeedPosition();
    if (savedPosition && savedPosition.eventFeedTab === activeTab) {
      const targetIndex = Math.min(savedPosition.eventFeedIndex, eventCount - 1);
      const targetScroll = targetIndex * window.innerHeight;

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        container.scrollTo({ top: targetScroll, behavior: "instant" });
        hasRestoredRef.current = true;
        clearEventFeedPosition();
      });
    }
  }, [activeTab, eventCount, getEventFeedPosition, clearEventFeedPosition]);

  // Track scroll position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const viewportHeight = window.innerHeight;
      const currentIndex = Math.round(scrollTop / viewportHeight);
      saveEventFeedPosition(currentIndex, activeTab);
    };

    // Debounce scroll handler for performance
    let scrollTimeout: ReturnType<typeof setTimeout>;
    const debouncedScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(handleScroll, 100);
    };

    container.addEventListener("scroll", debouncedScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", debouncedScroll);
      clearTimeout(scrollTimeout);
    };
  }, [activeTab, saveEventFeedPosition]);

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] overflow-y-auto snap-y snap-mandatory overscroll-contain scrollbar-hide"
    >
      {children}
    </div>
  );
}
