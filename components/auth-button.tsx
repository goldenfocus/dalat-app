"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
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
 * Client-side auth button that checks auth state without blocking ISR caching.
 * Shows a sign-in button for unauthenticated users, or UserMenu for authenticated users.
 */
export function AuthButton() {
  const t = useTranslations("nav");
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    user: null,
    profile: null,
    godMode: { isActive: false, realAdminId: null },
  });

  useEffect(() => {
    const supabase = createClient();

    async function loadAuthState() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          setAuthState({
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
                setAuthState({
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

        setAuthState({
          isLoading: false,
          user: { id: session.user.id },
          profile: profile as Profile | null,
          godMode: godModeState,
        });
      } catch {
        setAuthState({
          isLoading: false,
          user: null,
          profile: null,
          godMode: { isActive: false, realAdminId: null },
        });
      }
    }

    loadAuthState();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadAuthState();
    });

    return () => subscription.unsubscribe();
  }, []);

  const { isLoading, user, profile, godMode } = authState;

  // Show sign-in button while loading or when not authenticated
  if (isLoading || !user || !profile) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
    );
  }

  // Use real user ID for notifications, not impersonated user
  const userId = godMode.isActive && godMode.realAdminId ? godMode.realAdminId : user.id;

  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell userId={userId} />
      <UserMenu
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name}
        username={profile.username}
        role={profile.role}
        isGodMode={godMode.isActive}
      />
    </div>
  );
}
