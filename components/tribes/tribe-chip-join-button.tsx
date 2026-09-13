"use client";

import { RsvpCelebration } from "@/components/events/rsvp-celebration";
import { prepareCelebrationAudio } from "@/lib/communities/celebration-audio";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One-tap join, rendered beside a TribeChip for `public` tribes only.
 *
 * Deliberately does NOT reuse components/tribes/join-tribe-button.tsx: that
 * component is full-width and owns a request-message dialog. Non-public
 * access types get no button here
 * — the chip links to the tribe page, where the full flow already lives.
 */
export function TribeChipJoinButton({ slug, name }: { slug: string; name: string }) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [celebrate,setCelebrate] = useState(false);
  const [failed, setFailed] = useState(false);

  function handleJoin() {
    prepareCelebrationAudio();
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/tribes/${slug}/membership`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const result = await res.json();
        if (result.status === "joined") setCelebrate(true);
        else router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <>{celebrate && <RsvpCelebration kind="community" eventUrl={`${window.location.origin}/communities/${slug}`} eventTitle={name} eventDescription={null} startsAt="" onComplete={() => { setCelebrate(false); router.refresh(); }} />}<Button
      size="sm"
      variant="outline"
      onClick={handleJoin}
      disabled={isPending}
      className="min-h-11 max-w-full whitespace-normal px-3"
    >
      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
      {isPending ? t("joiningChip") : failed ? t("joinFailedChip") : t("joinTribe")}
    </Button></>
  );
}
