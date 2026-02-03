"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Heartbeat component - sends periodic activity pings to track user engagement.
 * Throttling happens server-side (only writes to DB if last action was >5 minutes ago).
 *
 * Mounts once in the layout and runs for authenticated users only.
 */
export function Heartbeat() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAuthenticatedRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    const sendHeartbeat = async () => {
      // Only send if authenticated
      if (!isAuthenticatedRef.current) return;

      try {
        await fetch("/api/heartbeat", { method: "POST" });
      } catch {
        // Silently fail - heartbeat is not critical
      }
    };

    const checkAuthAndStart = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      isAuthenticatedRef.current = !!user;

      if (user) {
        // Send initial heartbeat on mount
        sendHeartbeat();

        // Start interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      }
    };

    // Check auth status initially
    checkAuthAndStart();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      const wasAuthenticated = isAuthenticatedRef.current;
      isAuthenticatedRef.current = !!session?.user;

      if (session?.user && !wasAuthenticated) {
        // User just logged in - start heartbeat
        sendHeartbeat();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        }
      } else if (!session?.user && wasAuthenticated) {
        // User logged out - stop heartbeat
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return null;
}
