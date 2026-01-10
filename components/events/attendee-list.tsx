import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Rsvp, Profile } from "@/lib/types";

type RsvpWithProfile = Rsvp & { profiles: Profile };

interface AttendeeListProps {
  attendees: RsvpWithProfile[];
  waitlist: RsvpWithProfile[];
}

function AttendeeChip({
  rsvp,
  isWaitlist = false,
}: {
  rsvp: RsvpWithProfile;
  isWaitlist?: boolean;
}) {
  return (
    <Link
      href={`/${rsvp.profiles?.username || rsvp.user_id}`}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
        isWaitlist
          ? "bg-transparent border border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/60"
          : "bg-muted hover:bg-muted/80"
      }`}
    >
      {rsvp.profiles?.avatar_url ? (
        <img
          src={rsvp.profiles.avatar_url}
          alt=""
          className={`w-5 h-5 rounded-full ${isWaitlist ? "opacity-60" : ""}`}
        />
      ) : (
        <div
          className={`w-5 h-5 rounded-full ${isWaitlist ? "bg-muted-foreground/20" : "bg-primary/20"}`}
        />
      )}
      <span>
        {rsvp.profiles?.display_name || rsvp.profiles?.username || "Anonymous"}
      </span>
      {rsvp.plus_ones > 0 && (
        <span className="text-muted-foreground">+{rsvp.plus_ones}</span>
      )}
    </Link>
  );
}

export function AttendeeList({ attendees, waitlist }: AttendeeListProps) {
  if (attendees.length === 0 && waitlist.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-3">
          Who&apos;s going ({attendees.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {attendees.map((rsvp) => (
            <AttendeeChip key={rsvp.id} rsvp={rsvp} />
          ))}
        </div>

        {waitlist.length > 0 && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                Waitlist ({waitlist.length})
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-wrap gap-2">
              {waitlist.map((rsvp) => (
                <AttendeeChip key={rsvp.id} rsvp={rsvp} isWaitlist />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
