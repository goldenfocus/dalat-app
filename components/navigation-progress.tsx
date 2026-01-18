"use client";

import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { triggerHaptic } from "@/lib/haptics";

// Context for manual navigation control
interface NavigationContextType {
  startNavigation: () => void;
  endNavigation: () => void;
  isNavigating: boolean;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function useNavigationProgress() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigationProgress must be used within NavigationProgressProvider");
  }
  return context;
}

interface NavigationProgressProviderProps {
  children: React.ReactNode;
}

export function NavigationProgressProvider({ children }: NavigationProgressProviderProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const navigationTimeout = useRef<NodeJS.Timeout | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    if (navigationTimeout.current) {
      clearTimeout(navigationTimeout.current);
      navigationTimeout.current = null;
    }
  }, []);

  // Start the progress animation
  const startProgress = useCallback(() => {
    clearTimers();
    setIsNavigating(true);
    setProgress(0);
    triggerHaptic("light");

    // Animate progress - quick start, slow middle, fast finish
    let currentProgress = 0;
    progressInterval.current = setInterval(() => {
      currentProgress += Math.random() * 10;
      // Slow down as we approach 90%
      if (currentProgress > 70) {
        currentProgress += Math.random() * 2;
      }
      if (currentProgress > 90) {
        currentProgress = 90; // Cap at 90% until complete
        clearInterval(progressInterval.current!);
      }
      setProgress(Math.min(currentProgress, 90));
    }, 100);

    // Safety timeout - complete after 10s max
    navigationTimeout.current = setTimeout(() => {
      completeProgress();
    }, 10000);
  }, [clearTimers]);

  // Complete the progress animation
  const completeProgress = useCallback(() => {
    clearTimers();
    setProgress(100);

    // Hide after completion animation
    setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 200);
  }, [clearTimers]);

  // Manual controls for programmatic navigation
  const startNavigation = useCallback(() => {
    startProgress();
  }, [startProgress]);

  const endNavigation = useCallback(() => {
    completeProgress();
  }, [completeProgress]);

  // Detect route changes and complete progress
  useEffect(() => {
    if (isNavigating) {
      completeProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Listen for link clicks to start progress
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");

      if (link) {
        const href = link.getAttribute("href");
        // Only handle internal links
        if (href && href.startsWith("/") && !href.startsWith("//")) {
          // Ignore if it's an anchor link on same page
          if (href.includes("#") && href.split("#")[0] === pathname) {
            return;
          }
          // Ignore if download link
          if (link.hasAttribute("download")) {
            return;
          }
          // Ignore if opens in new tab
          if (link.getAttribute("target") === "_blank") {
            return;
          }
          startProgress();
        }
      }
    };

    // Use capture phase to catch clicks before navigation
    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
      clearTimers();
    };
  }, [pathname, startProgress, clearTimers]);

  return (
    <NavigationContext.Provider value={{ startNavigation, endNavigation, isNavigating }}>
      {/* Progress bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] h-1 pointer-events-none transition-opacity duration-200 ${
          isNavigating ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full bg-primary shadow-[0_0_10px_var(--primary)] transition-all duration-200 ease-out"
          style={{
            width: `${progress}%`,
            boxShadow: isNavigating ? "0 0 10px currentColor, 0 0 5px currentColor" : "none"
          }}
        />
      </div>
      {children}
    </NavigationContext.Provider>
  );
}
