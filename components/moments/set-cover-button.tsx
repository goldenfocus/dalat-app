"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImageIcon, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";

// Fun, cheeky success messages for setting cover
const SET_COVER_MESSAGES = [
  { title: "Main character energy!", description: "This photo is now the star of the show." },
  { title: "Album glow-up complete!", description: "Looking fresh on the homepage." },
  { title: "New cover, who dis?", description: "Your album just got a makeover." },
  { title: "Chef's kiss!", description: "This one's going straight to the top." },
  { title: "Cover material!", description: "This photo was born for this moment." },
  { title: "Promotion granted!", description: "From regular photo to album VIP." },
  { title: "Spotlight: ON", description: "This moment is now front and center." },
  { title: "First impressions matter!", description: "And this one nails it." },
];

// Fun messages for removing cover
const REMOVE_COVER_MESSAGES = [
  { title: "Back to civilian life", description: "This photo has been relieved of cover duties." },
  { title: "Plot twist!", description: "Someone else gets to shine now." },
  { title: "Cover removed", description: "The album will auto-pick something fabulous." },
];

// Error messages (still kind!)
const ERROR_MESSAGES = [
  { title: "Oops, that didn't work!", description: "Mind trying again? Tech gremlins are real." },
  { title: "Houston, we have a problem", description: "The cover couldn't be updated. Let's retry!" },
  { title: "Well, that's awkward...", description: "Something went wrong. One more try?" },
];

function getRandomMessage<T>(messages: T[]): T {
  return messages[Math.floor(Math.random() * messages.length)];
}

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

        // Show fun success toast
        const msg = isCover
          ? getRandomMessage(REMOVE_COVER_MESSAGES)
          : getRandomMessage(SET_COVER_MESSAGES);

        toast.success(msg.title, {
          description: msg.description,
        });

        router.refresh();
      } else {
        const data = await response.json();
        console.error("Failed to set cover:", data.error);
        triggerHaptic("error");

        const errorMsg = getRandomMessage(ERROR_MESSAGES);
        toast.error(errorMsg.title, {
          description: data.error || errorMsg.description,
        });
      }
    } catch (error) {
      console.error("Set cover error:", error);
      triggerHaptic("error");

      const errorMsg = getRandomMessage(ERROR_MESSAGES);
      toast.error(errorMsg.title, {
        description: errorMsg.description,
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
