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
}

/**
 * Client-side auth button for ISR-compatible pages.
 * Fetches user state on the client to avoid breaking server-side caching.
 */
export function AuthButtonClient() {
  const t = useTranslations("nav");
  const [auth, setAuth] = useState<AuthState>({
    isLoading: true,
    user: null,
    profile: null,
  });

  useEffect(() => {
    const supabase = createClient();

    async function fetchUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setAuth({ isLoading: false, user: null, profile: null });
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        setAuth({
          isLoading: false,
          user: { id: user.id },
          profile: profile as Profile | null,
        });
      } catch (error) {
        console.error("Failed to fetch auth state:", error);
        setAuth({ isLoading: false, user: null, profile: null });
      }
    }

    fetchUser();
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

  // Logged in
  return (
    <div className="flex items-center gap-2 shrink-0">
      <NotificationBell userId={auth.user.id} />
      <UserMenu
        avatarUrl={auth.profile.avatar_url}
        displayName={auth.profile.display_name}
        username={auth.profile.username}
        role={auth.profile.role}
        isGodMode={false}
      />
    </div>
  );
}
