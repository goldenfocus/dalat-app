"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side component that shows the "Create event" link only when authenticated.
 * This avoids server-side cookie checks that would prevent ISR caching.
 */
export function CreateEventLink() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Check initial auth state
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      setIsLoading(false);
    }
    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Don't render anything while loading or if not authenticated
  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <Link
      href="/events/new"
      prefetch={false}
      className="flex p-2 text-muted-foreground/70 hover:text-foreground active:scale-95 transition-all rounded-lg"
      aria-label="Create event"
    >
      <Plus className="w-5 h-5" strokeWidth={1.5} />
    </Link>
  );
}
