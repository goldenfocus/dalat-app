"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";

interface CommentInvitationProps {
  /** Recent commenters to show as social proof */
  recentCommenters?: Array<{
    avatar_url: string | null;
    display_name: string | null;
  }>;
  /** Total comment count for social proof */
  totalComments?: number;
  /** Path to redirect back to after login */
  redirectPath: string;
}

/**
 * Inviting placeholder shown to anonymous users in the comments section.
 * Shows social proof with commenter avatars and a warm CTA.
 */
export function CommentInvitation({
  recentCommenters = [],
  totalComments = 0,
  redirectPath,
}: CommentInvitationProps) {
  const t = useTranslations("moments.commentInvite");

  // Get display names for social proof
  const names = recentCommenters
    .slice(0, 2)
    .map((c) => c.display_name || "Someone")
    .filter(Boolean);

  const othersCount = Math.max(0, totalComments - names.length);

  // Determine which social proof message to show
  const getSocialProofText = () => {
    if (names.length === 0 && totalComments === 0) {
      return t("beFirst");
    }
    if (names.length > 0 && othersCount > 0) {
      return t("joinOthers", { names: names.join(", "), count: othersCount });
    }
    if (names.length > 0) {
      return t("joinFew", { names: names.join(" & ") });
    }
    return t("beFirst");
  };

  return (
    <div className="mb-6 space-y-3">
      {/* Disabled textarea mimic */}
      <div className="relative">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              disabled
              placeholder={t("placeholder")}
              rows={1}
              className="w-full resize-none min-h-[44px] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed placeholder:text-muted-foreground/70"
              aria-hidden="true"
            />
          </div>
          <div className="flex-shrink-0 h-11 w-11 rounded-md bg-muted/50 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-muted-foreground/50" />
          </div>
        </div>
      </div>

      {/* Social proof + CTA */}
      <div className="flex items-center gap-3">
        {/* Avatar stack */}
        {recentCommenters.length > 0 && (
          <div className="flex -space-x-2">
            {recentCommenters.slice(0, 3).map((commenter, i) => (
              <UserAvatar
                key={i}
                src={commenter.avatar_url}
                size="xs"
                className="ring-2 ring-background"
              />
            ))}
          </div>
        )}

        {/* Social proof text + CTA */}
        <p className="text-sm text-muted-foreground">
          <span>{getSocialProofText()}</span>
          {" · "}
          <Link
            href={`/auth/login?next=${encodeURIComponent(redirectPath)}`}
            className="text-primary hover:underline font-medium"
          >
            {t("cta")}
          </Link>
        </p>
      </div>
    </div>
  );
}
