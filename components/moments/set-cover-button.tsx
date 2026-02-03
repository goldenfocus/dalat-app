"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImageIcon, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";

interface SetCoverButtonProps {
  momentId: string;
  isCover: boolean;
  /** Only show for event organizers or superadmins */
  canSetCover: boolean;
}

export function SetCoverButton({ momentId, isCover, canSetCover }: SetCoverButtonProps) {
  const t = useTranslations("moments");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (!canSetCover) {
    return null;
  }

  const handleSetCover = async () => {
    setIsLoading(true);
    triggerHaptic("light");

    try {
      const response = await fetch(`/api/moments/${momentId}/cover`, {
        method: isCover ? "DELETE" : "POST",
      });

      if (response.ok) {
        triggerHaptic("success");
        router.refresh();
      } else {
        const data = await response.json();
        console.error("Failed to set cover:", data.error);
        triggerHaptic("error");
      }
    } catch (error) {
      console.error("Set cover error:", error);
      triggerHaptic("error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={isCover ? "secondary" : "outline"}
      size="sm"
      onClick={handleSetCover}
      disabled={isLoading}
      className="gap-1.5"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isCover ? (
        <Check className="w-4 h-4" />
      ) : (
        <ImageIcon className="w-4 h-4" />
      )}
      {isCover ? t("albumCover") : t("setAsCover")}
    </Button>
  );
}
