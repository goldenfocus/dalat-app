"use client";

import { useEffect, useState, useRef } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LocalePicker } from "@/components/locale-picker";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface AuthState {
  isLoading: boolean;
  user: { id: string } | null;
  profile: Profile | null;
  godMode: {
    isActive: boolean;
    realAdminId: string | null;
  };
}

/**
 * Mobile-only header with scroll-aware visibility.
 * Shows logo, locale picker, and auth state (notifications + avatar or sign-in).
 * Hides when scrolling down, reappears when scrolling up or near top.
 */
export function MobileHeader() {
  const t = useTranslations("nav");
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [auth, setAuth] = useState<AuthState>({
    isLoading: true,
    user: null,
    profile: null,
    godMode: { isActive: false, realAdminId: null },
  });

  // Scroll-aware visibility
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      const threshold = 10; // Prevent flickering on small movements

      if (currentY < 50) {
        // Always show when near top
        setIsVisible(true);
      } else if (currentY < lastScrollY.current - threshold) {
        // Scrolling up - show header
        setIsVisible(true);
      } else if (currentY > lastScrollY.current + threshold) {
        // Scrolling down - hide header
        setIsVisible(false);
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auth state (same pattern as AuthButtonClient)
  useEffect(() => {
    const supabase = createClient();

    async function fetchUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setAuth({
            isLoading: false,
            user: null,
            profile: null,
            godMode: { isActive: false, realAdminId: null },
          });
          return;
        }

        // Fetch profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        // Check for God mode cookie
        const hasGodModeCookie = document.cookie.includes("god_mode_user_id=");
        let godModeState = { isActive: false, realAdminId: null as string | null };

        if (hasGodModeCookie && profile?.role === "superadmin") {
          try {
            const res = await fetch("/api/admin/god-mode-state");
            if (res.ok) {
              const data = await res.json();
              if (data?.isActive && data?.targetProfile) {
                godModeState = {
                  isActive: true,
                  realAdminId: session.user.id,
                };
                setAuth({
                  isLoading: false,
                  user: { id: session.user.id },
                  profile: data.targetProfile,
                  godMode: godModeState,
                });
                return;
              }
            }
          } catch {
            // God mode check failed, continue with normal profile
          }
        }

        setAuth({
          isLoading: false,
          user: { id: session.user.id },
          profile: profile as Profile | null,
          godMode: godModeState,
        });
      } catch (error) {
        console.error("Failed to fetch auth state:", error);
        setAuth({
          isLoading: false,
          user: null,
          profile: null,
          godMode: { isActive: false, realAdminId: null },
        });
      }
    }

    fetchUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Get the actual user ID (for notifications - use real admin ID if in God Mode)
  const userId =
    auth.godMode.isActive && auth.godMode.realAdminId
      ? auth.godMode.realAdminId
      : auth.user?.id;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full",
        "border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "transition-transform duration-150 ease-out",
        !isVisible && "-translate-y-full"
      )}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 -ml-2 px-2 py-1.5 rounded-lg active:scale-95 transition-transform"
        >
          <span className="font-bold text-lg">ĐàLạt.app</span>
        </Link>

        {/* Right side: Locale + Auth */}
        <div className="flex items-center gap-1">
          <LocalePicker userId={auth.profile?.id} />

          {/* Auth state */}
          {auth.isLoading ? (
            // Loading placeholder
            <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          ) : auth.user && auth.profile ? (
            // Logged in: Notification bell + Avatar
            <div className="flex items-center gap-1">
              <NotificationBell userId={userId!} />
              <UserMenu
                avatarUrl={auth.profile.avatar_url}
                displayName={auth.profile.display_name}
                username={auth.profile.username}
                role={auth.profile.role}
                isGodMode={auth.godMode.isActive}
              />
            </div>
          ) : (
            // Not logged in: Sign in button
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-9 px-3 active:scale-95 transition-transform"
            >
              <Link href="/auth/login">{t("signIn")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
