"use client";

import { Link } from "@/lib/i18n/routing";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslations } from "next-intl";
import type { Rsvp, Profile } from "@/lib/types";

type RsvpWithProfile = Rsvp & { profiles: Profile };

const MAX_AVATARS = 8;

export function SidebarAttendeePreview({
  attendees,
  isPast = false,
}: {
  attendees: RsvpWithProfile[];
  isPast?: boolean;
}) {
  const t = useTranslations("attendees");
  const shown = attendees.slice(0, MAX_AVATARS);
  const remaining = attendees.length - shown.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((rsvp) => (
          <Link
            key={rsvp.id}
            href={`/${rsvp.profiles?.username || rsvp.user_id}`}
            title={rsvp.profiles?.display_name || rsvp.profiles?.username}
          >
            <UserAvatar
              src={rsvp.profiles?.avatar_url}
              size="sm"
              alt={rsvp.profiles?.display_name || rsvp.profiles?.username}
            />
          </Link>
        ))}
        {remaining > 0 && (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium">
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}
