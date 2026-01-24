"use client";

import { Eye, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types";

interface GodModeIndicatorProps {
  targetProfile: Profile;
}

// Internal indicator component (when we already have the profile)
function GodModeIndicatorInner({ targetProfile }: GodModeIndicatorProps) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const handleExit = async () => {
    setExiting(true);
    try {
      await fetch("/api/admin/exit-impersonation", { method: "POST" });
      router.push("/admin/users");
      router.refresh();
    } catch (error) {
      console.error("Failed to exit God mode:", error);
      setExiting(false);
    }
  };

  const displayName =
    targetProfile.display_name ||
    (targetProfile.username ? `@${targetProfile.username}` : "User");

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-amber-500 text-amber-950 px-4 py-2 rounded-full shadow-lg animate-in slide-in-from-bottom-4 duration-300">
      <Eye className="w-4 h-4 shrink-0" />
      <span className="text-sm font-medium whitespace-nowrap">
        Viewing as <strong>{displayName}</strong>
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleExit}
        disabled={exiting}
        className="h-7 px-2 hover:bg-amber-600 hover:text-amber-950 text-amber-950"
      >
        <X className="w-4 h-4 mr-1" />
        {exiting ? "Exiting..." : "Exit"}
      </Button>
    </div>
  );
}

// Exported version that fetches god mode state client-side
// This avoids server-side cookie checks in the layout, preserving ISR caching
export function GodModeIndicator({ targetProfile }: GodModeIndicatorProps) {
  return <GodModeIndicatorInner targetProfile={targetProfile} />;
}

interface GodModeState {
  isActive: boolean;
  targetProfile: Profile | null;
}

// Client-side wrapper that checks for god mode without blocking SSR
export function GodModeIndicatorWrapper() {
  const [godMode, setGodMode] = useState<GodModeState | null>(null);

  useEffect(() => {
    // Check for god mode cookie client-side
    const hasGodModeCookie = document.cookie.includes("god_mode_user_id=");
    if (!hasGodModeCookie) {
      setGodMode({ isActive: false, targetProfile: null });
      return;
    }

    // Only fetch if cookie exists (superadmin impersonating)
    fetch("/api/admin/god-mode-state")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.isActive && data?.targetProfile) {
          setGodMode({ isActive: true, targetProfile: data.targetProfile });
        } else {
          setGodMode({ isActive: false, targetProfile: null });
        }
      })
      .catch(() => setGodMode({ isActive: false, targetProfile: null }));
  }, []);

  // Don't render anything until we know the state, or if not in god mode
  if (!godMode?.isActive || !godMode.targetProfile) {
    return null;
  }

  return <GodModeIndicatorInner targetProfile={godMode.targetProfile} />;
}
