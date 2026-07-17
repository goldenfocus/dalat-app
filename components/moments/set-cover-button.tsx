"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImageIcon, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";

// Fun, cheeky success messages for setting cover (translated under moments.setCover)
const SET_COVER_KEYS = [
  "success1",
  "success2",
  "success3",
  "success4",
  "success5",
  "success6",
  "success7",
  "success8",
] as const;

// Fun messages for removing cover
const REMOVE_COVER_KEYS = ["remove1", "remove2", "remove3"] as const;

// Error messages (still kind!)
const ERROR_KEYS = ["error1", "error2", "error3"] as const;

function getRandomKey<T>(keys: readonly T[]): T {
  return keys[Math.floor(Math.random() * keys.length)];
}

interface SetCoverButtonProps {
  momentId: string;
  isCover: boolean;
  /** Only show for event organizers or superadmins */
  canSetCover: boolean;
}

export function SetCoverButton({ momentId, isCover, canSetCover }: SetCoverButtonProps) {
  const t = useTranslations("moments");
  const tCover = useTranslations("moments.setCover");
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

        // Show fun success toast
        const key = isCover
          ? getRandomKey(REMOVE_COVER_KEYS)
          : getRandomKey(SET_COVER_KEYS);

        toast.success(tCover(`${key}.title`), {
          description: tCover(`${key}.description`),
        });

        router.refresh();
      } else {
        const data = await response.json();
        console.error("Failed to set cover:", data.error);
        triggerHaptic("error");

        const errorKey = getRandomKey(ERROR_KEYS);
        toast.error(tCover(`${errorKey}.title`), {
          description: data.error || tCover(`${errorKey}.description`),
        });
      }
    } catch (error) {
      console.error("Set cover error:", error);
      triggerHaptic("error");

      const errorKey = getRandomKey(ERROR_KEYS);
      toast.error(tCover(`${errorKey}.title`), {
        description: tCover(`${errorKey}.description`),
      });
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
