"use client";

import { useState, useEffect } from "react";
import { CalendarPlus, HousePlus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side component that shows creation actions only when authenticated.
 * This avoids server-side cookie checks that would prevent ISR caching.
 */
export function CreateEventLink() {
  const t = useTranslations("common");
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t("create")}>
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem asChild>
          <Link href="/events/new" prefetch={false} className="min-h-11 cursor-pointer gap-2">
            <CalendarPlus aria-hidden="true" /> {t("addEvent")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/rentals/new" prefetch={false} className="min-h-11 cursor-pointer gap-2">
            <HousePlus aria-hidden="true" /> {t("addRental")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
