"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Check, X, UserCheck, Clock, UserX, Share2, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";
import type { CheckinAttendee } from "@/app/[locale]/events/[slug]/checkin/page";

interface CheckinInterfaceProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  capacity: number | null;
  attendees: CheckinAttendee[];
  checkinCode: string | null;
  isOrganizer: boolean;
}

type AttendeeStatus = "checked_in" | "pending" | "no_show";

function getStatus(attendee: CheckinAttendee): AttendeeStatus {
  if (attendee.checked_in_at) return "checked_in";
  if (attendee.no_show_at) return "no_show";
  return "pending";
}

function getDisplayName(attendee: CheckinAttendee): string {
  return attendee.profiles?.display_name || attendee.profiles?.username || "Anonymous";
}

export function CheckinInterface({
  eventId,
  eventSlug,
  eventTitle,
  capacity,
  attendees: initialAttendees,
  checkinCode,
  isOrganizer,
}: CheckinInterfaceProps) {
  const t = useTranslations("checkin");
  const router = useRouter();
  const [attendees, setAttendees] = useState(initialAttendees);
  const [search, setSearch] = useState("");
  const [, startTransition] = useTransition();
  const [linkCopied, setLinkCopied] = useState(false);

  // Stats computed from current state
  const stats = useMemo(() => {
    let checkedIn = 0;
    let pending = 0;
    let noShow = 0;
    for (const a of attendees) {
      const status = getStatus(a);
      if (status === "checked_in") checkedIn++;
      else if (status === "no_show") noShow++;
      else pending++;
    }
    return { checkedIn, pending, noShow, total: attendees.length };
  }, [attendees]);

  // Client-side search filtering
  const filtered = useMemo(() => {
    if (!search.trim()) return attendees;
    const q = search.toLowerCase().trim();
    return attendees.filter((a) => {
      const name = getDisplayName(a).toLowerCase();
      const username = (a.profiles?.username ?? "").toLowerCase();
      const email = (a.auth_email ?? "").toLowerCase();
      // Also search plus-one guests
      const plusOneMatch = (a.plus_one_guests ?? []).some(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.email ?? "").toLowerCase().includes(q)
      );
      return (
        name.includes(q) ||
        username.includes(q) ||
        email.includes(q) ||
        plusOneMatch
      );
    });
  }, [attendees, search]);

  // Share link handler
  const handleShareLink = useCallback(async () => {
    if (!checkinCode) return;
    const url = `${window.location.origin}/events/${eventSlug}/checkin?code=${checkinCode}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: eventTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch {
      // User cancelled share dialog
    }
  }, [checkinCode, eventSlug, eventTitle]);

  // Optimistic check-in
  const handleCheckIn = useCallback(
    (rsvpId: string) => {
      setAttendees((prev) =>
        prev.map((a) =>
          a.id === rsvpId
            ? { ...a, checked_in_at: new Date().toISOString(), no_show_at: null }
            : a
        )
      );

      startTransition(async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc("checkin_attendee", {
          p_rsvp_id: rsvpId,
          p_event_id: eventId,
          p_checkin_code: checkinCode,
        });
        if (!data?.ok) {
          router.refresh();
        }
      });
    },
    [eventId, checkinCode, router]
  );

  // Optimistic undo check-in
  const handleUndoCheckIn = useCallback(
    (rsvpId: string) => {
      setAttendees((prev) =>
        prev.map((a) =>
          a.id === rsvpId
            ? { ...a, checked_in_at: null, checked_in_by: null, checkin_note: null }
            : a
        )
      );

      startTransition(async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc("undo_checkin", {
          p_rsvp_id: rsvpId,
          p_event_id: eventId,
          p_checkin_code: checkinCode,
        });
        if (!data?.ok) {
          router.refresh();
        }
      });
    },
    [eventId, checkinCode, router]
  );

  // Optimistic toggle no-show
  const handleToggleNoShow = useCallback(
    (rsvpId: string, isNoShow: boolean) => {
      setAttendees((prev) =>
        prev.map((a) =>
          a.id === rsvpId
            ? isNoShow
              ? { ...a, no_show_at: new Date().toISOString(), checked_in_at: null, checked_in_by: null }
              : { ...a, no_show_at: null }
            : a
        )
      );

      startTransition(async () => {
        const supabase = createClient();
        const { data } = await supabase.rpc("toggle_no_show", {
          p_rsvp_id: rsvpId,
          p_event_id: eventId,
          p_is_no_show: isNoShow,
          p_checkin_code: checkinCode,
        });
        if (!data?.ok) {
          router.refresh();
        }
      });
    },
    [eventId, checkinCode, router]
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/events/${eventSlug}`}
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("title")}</span>
            </Link>
            {isOrganizer && checkinCode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShareLink}
                className="gap-1.5"
              >
                {linkCopied ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    {t("linkCopied")}
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    {t("shareLink")}
                  </>
                )}
              </Button>
            )}
          </div>
          <h1 className="text-lg font-semibold truncate mt-1">{eventTitle}</h1>
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-600">
              {stats.checkedIn}
              {capacity ? `/${capacity}` : `/${stats.total}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-amber-500">{stats.pending}</span>
          </div>
          {stats.noShow > 0 && (
            <div className="flex items-center gap-1.5">
              <UserX className="w-4 h-4 text-red-500" />
              <span className="font-medium text-red-500">{stats.noShow}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="max-w-lg mx-auto px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-12 text-base"
            autoFocus
          />
        </div>
      </div>

      {/* Attendee list */}
      <div className="max-w-lg mx-auto px-4 pb-8">
        {attendees.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {t("noAttendees")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            {t("noResults")}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((attendee) => (
              <AttendeeRow
                key={attendee.id}
                attendee={attendee}
                onCheckIn={handleCheckIn}
                onUndoCheckIn={handleUndoCheckIn}
                onToggleNoShow={handleToggleNoShow}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Individual attendee row
// -------------------------------------------------------------------

interface AttendeeRowProps {
  attendee: CheckinAttendee;
  onCheckIn: (rsvpId: string) => void;
  onUndoCheckIn: (rsvpId: string) => void;
  onToggleNoShow: (rsvpId: string, isNoShow: boolean) => void;
  t: ReturnType<typeof useTranslations<"checkin">>;
}

function AttendeeRow({
  attendee,
  onCheckIn,
  onUndoCheckIn,
  onToggleNoShow,
  t,
}: AttendeeRowProps) {
  const status = getStatus(attendee);
  const displayName = getDisplayName(attendee);
  const plusOnes = attendee.plus_one_guests ?? [];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
          status === "checked_in" && "bg-green-50 dark:bg-green-950/30",
          status === "no_show" && "bg-red-50 dark:bg-red-950/30"
        )}
      >
        {/* Avatar + name */}
        <UserAvatar
          src={attendee.profiles?.avatar_url}
          alt={displayName}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{displayName}</p>
          {attendee.profiles?.username && (
            <p className="text-xs text-muted-foreground truncate">
              @{attendee.profiles.username}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {status === "checked_in" ? (
            <button
              type="button"
              onClick={() => onUndoCheckIn(attendee.id)}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-green-600 text-white active:scale-95 transition-transform"
              title={t("undoCheckIn")}
            >
              <Check className="w-5 h-5" />
            </button>
          ) : status === "no_show" ? (
            <button
              type="button"
              onClick={() => onToggleNoShow(attendee.id, false)}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-red-500 text-white active:scale-95 transition-transform"
              title={t("undoNoShow")}
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onCheckIn(attendee.id)}
                className="flex items-center justify-center w-11 h-11 rounded-full border-2 border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 active:scale-95 transition-all"
                title={t("checkInButton")}
              >
                <Check className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onToggleNoShow(attendee.id, true)}
                className="flex items-center justify-center w-11 h-11 rounded-full border-2 border-red-400 text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-95 transition-all"
                title={t("markNoShow")}
              >
                <X className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Plus-one guests */}
      {plusOnes.length > 0 && (
        <div className="ml-11 pl-3 border-l-2 border-muted">
          {plusOnes.map((guest) => (
            <div
              key={guest.id}
              className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground"
            >
              <span className="truncate">
                {guest.name}
              </span>
              <span className="text-xs shrink-0">
                ({t("guestOf", { host: displayName })})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
