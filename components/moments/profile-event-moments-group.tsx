"use client";

import { Link } from "@/lib/i18n/routing";
import { format } from "date-fns";
import { Calendar, ChevronRight } from "lucide-react";
import { MomentCard } from "./moment-card";
import type { EventMomentsGroup as EventMomentsGroupType } from "@/lib/types";

interface ProfileEventMomentsGroupProps {
  group: EventMomentsGroupType;
  /** Map of moment ID to comment count */
  commentCounts?: Map<string, number>;
}

export function ProfileEventMomentsGroup({ group, commentCounts }: ProfileEventMomentsGroupProps) {
  const eventDate = new Date(group.event_starts_at);

  return (
    <div className="space-y-3">
      {/* Event header - tappable link to event */}
      <Link
        href={`/events/${group.event_slug}`}
        className="flex items-center justify-between gap-2 px-3 py-2.5 -mx-3 rounded-lg bg-muted/50 hover:bg-muted active:scale-[0.99] transition-all touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{group.event_title}</span>
          <span className="text-sm text-muted-foreground shrink-0">
            {format(eventDate, "MMM d")}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>

      {/* Moments grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {group.moments.map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            eventSlug={group.event_slug}
            from="profile"
            commentCount={commentCounts?.get(moment.id)}
          />
        ))}
      </div>
    </div>
  );
}
