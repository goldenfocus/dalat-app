"use client";

import { useTranslations } from "next-intl";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShare } from "@/lib/hooks/use-share";
import type { Tribe } from "@/lib/types";

interface TribeShareButtonProps {
  tribe: Pick<Tribe, "name" | "slug" | "access_type">;
  /**
   * The tribe's join code — pass ONLY for admins. An invite code grants
   * instant membership (`/api/tribes/[slug]/membership` accepts any valid
   * code with no approval step), and `invite_only` tribes are readable by
   * anonymous visitors under RLS. Handing that code to every visitor would
   * turn "invite only" into "anyone with the share button".
   */
  inviteCode?: string | null;
}

/**
 * Share affordance for a tribe — shown to everyone, not just admins.
 *
 * Admins of a private tribe share a join-code link. Everyone else shares the
 * slug URL, which is correct for `public`/`request`/`invite_only` (all three
 * are readable by non-members). A `secret` tribe has no shareable URL for a
 * non-admin, so the button is hidden rather than offering a link that 404s.
 */
export function TribeShareButton({ tribe, inviteCode }: TribeShareButtonProps) {
  const t = useTranslations("tribes");
  const { share, copied } = useShare();

  if (tribe.access_type === "secret" && !inviteCode) return null;

  const handleShare = () => {
    // Built here, not during render — origin is empty on the server.
    const path = inviteCode ? `/tribes/join/${inviteCode}` : `/tribes/${tribe.slug}`;

    return share({
      title: tribe.name,
      text: t("shareTribeText", { name: tribe.name }),
      url: `${window.location.origin}${path}`,
    });
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleShare}
      className="h-11 w-11"
      title={copied ? t("copied") : t("shareTribe")}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
      <span className="sr-only">{t("shareTribe")}</span>
    </Button>
  );
}
