"use client";

import { Eye, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types";

interface GodModeIndicatorProps {
  targetProfile: Profile;
}

export function GodModeIndicator({ targetProfile }: GodModeIndicatorProps) {
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
