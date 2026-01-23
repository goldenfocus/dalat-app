"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useScrollRestoration } from "@/lib/contexts/scroll-restoration-context";
import { EventFeedTabs, type EventLifecycle } from "./event-feed-tabs";

interface EventFeedImmersiveClientProps {
  children: ReactNode;
  eventCount: number;
  activeTab: EventLifecycle;
  subtitle?: string;
  tabLabels: { upcoming: string; happening: string; past: string };
  lifecycleCounts?: { upcoming: number; happening: number; past: number };
}

export function EventFeedImmersiveClient({
  children,
  eventCount,
  activeTab,
  subtitle,
  tabLabels,
  lifecycleCounts,
}: EventFeedImmersiveClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { saveEventFeedPosition, getEventFeedPosition, clearEventFeedPosition } =
    useScrollRestoration();
  const hasRestoredRef = useRef(false);
  const [hasScrolled, setHasScrolled] = useState(false);

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

      // Hide subtitle once user scrolls past threshold
      if (scrollTop > 20 && !hasScrolled) {
        setHasScrolled(true);
      }
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
  }, [activeTab, saveEventFeedPosition, hasScrolled]);

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] overflow-y-auto snap-y snap-mandatory overscroll-contain scrollbar-hide"
    >
      {/* Floating tabs - fade out on scroll */}
      <div
        className={`fixed top-14 left-0 right-0 z-40 px-3 transition-opacity duration-300 lg:hidden ${
          hasScrolled ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <EventFeedTabs
          activeTab={activeTab}
          variant="floating"
          useUrlNavigation
          counts={lifecycleCounts}
          hideEmptyTabs={!!lifecycleCounts}
          labels={tabLabels}
        />
      </div>

      {/* Floating subtitle - fades out on scroll */}
      {subtitle && (
        <div
          className={`fixed top-[6.5rem] left-0 right-0 z-30 text-center pointer-events-none transition-opacity duration-300 lg:hidden ${
            hasScrolled ? "opacity-0" : "opacity-100"
          }`}
        >
          <p className="text-white/70 text-sm px-4 drop-shadow-lg">
            {subtitle}
          </p>
        </div>
      )}
      {children}
    </div>
  );
}
