"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasRoleLevel, type UserRole } from "@/lib/types";

interface MomentPermissions {
  currentUserId: string | undefined;
  isOwner: boolean;
  canModerate: boolean;
  isLoading: boolean;
}

/**
 * Client-side hook to check if the current user can delete/moderate a moment.
 * Fetches auth + profile role once and derives permissions.
 */
export function useMomentPermissions(momentUserId: string): MomentPermissions {
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<UserRole>("user");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPermissions() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (cancelled || !user) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      // Fetch role from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        if (profile?.role) {
          setUserRole(profile.role as UserRole);
        }
        setIsLoading(false);
      }
    }

    fetchPermissions();
    return () => { cancelled = true; };
  }, []);

  const isOwner = !!currentUserId && currentUserId === momentUserId;
  const canModerate = !!currentUserId && hasRoleLevel(userRole, "moderator");

  return { currentUserId, isOwner, canModerate, isLoading };
}
