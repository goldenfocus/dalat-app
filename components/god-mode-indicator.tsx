"use client";

import { Eye, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useViewer, exitGodMode } from "@/lib/hooks/use-viewer";
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
      await exitGodMode();
      router.push("/admin/users");
      router.refresh();
    } catch (error) {
      console.error("Failed to exit God mode:", error);
      toast.error("Could not exit God mode. Please try again.");
      setExiting(false);
    }
  };

  const displayName =
    targetProfile.display_name ||
    (targetProfile.username ? `@${targetProfile.username}` : "User");

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-amber-500 text-amber-950 px-4 py-2 rounded-full shadow-lg">
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

// Shared identity updates synchronously before either navigation.
export function GodModeIndicatorWrapper() {
  const { profile, isGodMode } = useViewer();
  if (!isGodMode || !profile) return null;
  return <GodModeIndicatorInner targetProfile={profile} />;
}
