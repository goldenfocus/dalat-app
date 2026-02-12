"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Camera, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { QuickUploadSheet } from "./quick-upload-sheet";
import type { RecentEventForUpload } from "@/lib/types";

interface UploadFABProps {
  /** Pre-select an event (when on event page) */
  preselectedEventSlug?: string;
  className?: string;
}

/**
 * Extracts event slug from pathname if on an event page.
 * Matches: /[locale]/events/[slug] and sub-paths like /[locale]/events/[slug]/moments
 */
function getEventSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/[a-z]{2}\/events\/([^/]+)(?:\/.*)?$/);
  return match ? match[1] : null;
}

/**
 * Floating Action Button for quick moment upload.
 * Shows on most pages for authenticated users.
 * Auto-detects event pages and links directly to that event's moment upload.
 */
export function UploadFAB({ preselectedEventSlug, className }: UploadFABProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentEventForUpload[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Auto-detect event slug from URL when on event pages
  const eventSlug = useMemo(() => {
    return preselectedEventSlug || getEventSlugFromPath(pathname ?? "");
  }, [preselectedEventSlug, pathname]);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
    };
    checkAuth();

    // Listen for auth changes
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch recent events when sheet opens
  useEffect(() => {
    if (!isOpen || !isAuthenticated) return;

    const fetchRecentEvents = async () => {
      setIsLoading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.rpc('get_user_recent_events_for_upload', {
          p_user_id: user.id,
          p_limit: 10,
        });

        if (error) {
          console.error('Error fetching recent events:', error);
          return;
        }

        setRecentEvents(data || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecentEvents();
  }, [isOpen, isAuthenticated]);

  // Hide on certain pages
  const hiddenPaths = [
    '/moments/new',
    '/auth/',
    '/onboarding',
    '/admin/',
  ];

  const shouldHide = hiddenPaths.some(path => (pathname ?? "").includes(path));

  if (shouldHide || isAuthenticated === false || isAuthenticated === null) {
    return null;
  }

  // If on event page, go directly to upload for that event
  const handleFabClick = () => {
    if (eventSlug) {
      router.push(`/events/${eventSlug}/moments/new`);
    } else {
      setIsOpen(true);
    }
  };

  const handleEventSelect = (event: RecentEventForUpload) => {
    setIsOpen(false);
    router.push(`/events/${event.slug}/moments/new`);
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={handleFabClick}
        className={cn(
          "fixed z-40 flex items-center justify-center",
          "w-14 h-14 rounded-full",
          "bg-primary text-primary-foreground shadow-lg",
          "hover:bg-primary/90 active:scale-95 transition-all",
          // Position above bottom nav (5rem = 80px)
          "bottom-[calc(5rem+env(safe-area-inset-bottom)+1rem)] right-4",
          className
        )}
        aria-label="Share a moment"
      >
        <div className="relative">
          <Camera className="w-6 h-6" />
          <Plus className="w-3 h-3 absolute -top-1 -right-1 bg-primary rounded-full" />
        </div>
      </button>

      {/* Quick Upload Sheet */}
      <QuickUploadSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        recentEvents={recentEvents}
        isLoading={isLoading}
        onEventSelect={handleEventSelect}
      />
    </>
  );
}
