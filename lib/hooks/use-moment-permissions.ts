"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasRoleLevel, type UserRole } from "@/lib/types";

interface MomentPermissions {
  currentUserId: string | undefined;
  isOwner: boolean;
  canModerate: boolean;
  isEventCreator: boolean;
  isLoading: boolean;
}

/**
 * Client-side hook to check if the current user can delete/moderate a moment.
 * Fetches auth + profile role once and derives permissions.
 * Pass eventSlug to also check whether the current user created the event
 * (event creators can set the album cover).
 */
export function useMomentPermissions(
  momentUserId: string,
  eventSlug?: string
): MomentPermissions {
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<UserRole>("user");
  const [eventCreatorId, setEventCreatorId] = useState<string | undefined>();
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

      // Fetch role from profile (+ event creator when slug provided)
      const [{ data: profile }, eventResult] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).single(),
        eventSlug
          ? supabase.from("events").select("created_by").eq("slug", eventSlug).single()
          : Promise.resolve({ data: null }),
      ]);

      if (!cancelled) {
        if (profile?.role) {
          setUserRole(profile.role as UserRole);
        }
        if (eventResult.data?.created_by) {
          setEventCreatorId(eventResult.data.created_by);
        }
        setIsLoading(false);
      }
    }

    fetchPermissions();
    return () => { cancelled = true; };
  }, [eventSlug]);

  const isOwner = !!currentUserId && currentUserId === momentUserId;
  const canModerate = !!currentUserId && hasRoleLevel(userRole, "moderator");
  const isEventCreator = !!currentUserId && currentUserId === eventCreatorId;

  return { currentUserId, isOwner, canModerate, isEventCreator, isLoading };
}
