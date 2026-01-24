"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { Button } from "./ui/button";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notifications/notification-bell";
import { createClient } from "@/lib/supabase/client";
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
 * Client-side auth button for ISR-compatible pages.
 * Fetches user state on the client to avoid breaking server-side caching.
 * Supports God Mode impersonation for superadmins.
 */
export function AuthButtonClient() {
  const t = useTranslations("nav");
  const [auth, setAuth] = useState<AuthState>({
    isLoading: true,
    user: null,
    profile: null,
    godMode: { isActive: false, realAdminId: null },
  });

  useEffect(() => {
    const supabase = createClient();

    async function fetchUser() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

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
          // Fetch god mode state from API
          try {
            const res = await fetch("/api/admin/god-mode-state");
            if (res.ok) {
              const data = await res.json();
              if (data?.isActive && data?.targetProfile) {
                godModeState = {
                  isActive: true,
                  realAdminId: session.user.id,
                };
                // When in god mode, use target profile
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading state - show nothing to avoid layout shift
  if (auth.isLoading) {
    return <div className="w-8 h-8" />; // Placeholder
  }

  // Not logged in
  if (!auth.user || !auth.profile) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
    );
  }

  // Use real user ID for notifications, not impersonated user
  const userId = auth.godMode.isActive && auth.godMode.realAdminId
    ? auth.godMode.realAdminId
    : auth.user.id;

  // Logged in
  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell userId={userId} />
      <UserMenu
        avatarUrl={auth.profile.avatar_url}
        displayName={auth.profile.display_name}
        username={auth.profile.username}
        role={auth.profile.role}
        isGodMode={auth.godMode.isActive}
      />
    </div>
  );
}
