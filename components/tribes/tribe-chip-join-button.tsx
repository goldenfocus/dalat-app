"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One-tap join, rendered beside a TribeChip for `public` tribes only.
 *
 * Deliberately does NOT reuse components/tribes/join-tribe-button.tsx: that
 * component is full-width, owns a request-message dialog, and is being
 * rewritten in a parallel worktree. Non-public access types get no button here
 * — the chip links to the tribe page, where the full flow already lives.
 */
export function TribeChipJoinButton({ slug }: { slug: string }) {
  const t = useTranslations("tribes");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function handleJoin() {
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
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleJoin}
      disabled={isPending}
      className="shrink-0 min-h-9 px-3"
    >
      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
      {isPending ? t("joiningChip") : failed ? t("joinFailedChip") : t("joinTribe")}
    </Button>
  );
}
