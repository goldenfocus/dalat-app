"use client";

import { Link } from "@/lib/i18n/routing";
import { useTranslations } from "next-intl";
import { MessageCircle, Calendar } from "lucide-react";
import { CommentsSection } from "./comments-section";
import { CommentInvitation } from "./comment-invitation";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { Rsvp } from "@/lib/types";

interface EventCommentsSectionProps {
  /** Event ID */
  eventId: string;
  /** Event slug for RSVP redirect */
  eventSlug: string;
  /** Event creator ID for moderation */
  contentOwnerId: string;
  /** Current user ID (undefined if not logged in) */
  currentUserId?: string;
  /** User's RSVP status (undefined if not RSVP'd) */
  rsvpStatus?: Rsvp["status"];
  /** Whether user is event creator or admin */
  canManageEvent?: boolean;
  /** Recent commenters for social proof (anonymous users) */
  recentCommenters?: Array<{
    avatar_url: string | null;
    display_name: string | null;
  }>;
  /** Total comment count for social proof */
  totalComments?: number;
}

/**
 * Event-specific comments section with RSVP gating.
 * - Logged in + RSVP'd → Full comments section
 * - Logged in + not RSVP'd → Invitation to RSVP
 * - Not logged in → Invitation to sign up
 * - Event creator/admin → Always has access
 */
export function EventCommentsSection({
  eventId,
  eventSlug,
  contentOwnerId,
  currentUserId,
  rsvpStatus,
  canManageEvent,
  recentCommenters = [],
  totalComments = 0,
}: EventCommentsSectionProps) {
  const t = useTranslations("comments");
  const tEvent = useTranslations("events.comments");

  const redirectPath = `/events/${eventSlug}`;

  // Check if user can comment
  // User can comment if: RSVP'd (going, waitlist, interested) OR is event manager
  const canComment =
    canManageEvent ||
    (rsvpStatus && ["going", "waitlist", "interested"].includes(rsvpStatus));

  // Case 1: Not logged in - show login invitation
  if (!currentUserId) {
    return (
      <div className="mt-8 border-t pt-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {t("title")}
            {totalComments > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">
                ({totalComments})
              </span>
            )}
          </h2>
        </div>
        <CommentInvitation
          recentCommenters={recentCommenters}
          totalComments={totalComments}
          redirectPath={redirectPath}
        />
      </div>
    );
  }

  // Case 2: Logged in but no RSVP - show RSVP invitation
  if (!canComment) {
    return (
      <div className="mt-8 border-t pt-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">
            {t("title")}
            {totalComments > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">
                ({totalComments})
              </span>
            )}
          </h2>
        </div>
        <RsvpInvitation
          recentCommenters={recentCommenters}
          totalComments={totalComments}
        />
      </div>
    );
  }

  // Case 3: Logged in + RSVP'd (or manager) - show full comments section
  return (
    <CommentsSection
      targetType="event"
      targetId={eventId}
      contentOwnerId={contentOwnerId}
      currentUserId={currentUserId}
      redirectPath={redirectPath}
    />
  );
}

interface RsvpInvitationProps {
  recentCommenters?: Array<{
    avatar_url: string | null;
    display_name: string | null;
  }>;
  totalComments?: number;
}

/**
 * Invitation shown to logged-in users who haven't RSVP'd.
 * Encourages them to join the event to participate in discussion.
 */
function RsvpInvitation({
  recentCommenters = [],
  totalComments = 0,
}: RsvpInvitationProps) {
  const t = useTranslations("events.comments");

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
          <span className="text-primary font-medium inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {t("cta")}
          </span>
        </p>
      </div>
    </div>
  );
}
