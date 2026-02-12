"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Clock, Bell, Loader2 } from "lucide-react";
import { Link } from "@/lib/i18n/routing";

interface Attendee {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  username: string | null;
  confirmed_at?: string;
  reconfirmed_at?: string;
  created_at?: string;
}

interface ReconfirmationDashboardProps {
  eventId: string;
  eventSlug: string;
  totalGoing: number;
  confirmed: number;
  pending: number;
  cancelled: number;
  confirmedAttendees: Attendee[];
  pendingAttendees: Attendee[];
  lastRePingAt: string | null;
}

export function ReconfirmationDashboard({
  eventId,
  eventSlug,
  totalGoing,
  confirmed,
  pending,
  cancelled,
  confirmedAttendees,
  pendingAttendees,
  lastRePingAt,
}: ReconfirmationDashboardProps) {
  const t = useTranslations("reconfirmation");
  const [isRePinging, setIsRePinging] = useState(false);
  const [rePingResult, setRePingResult] = useState<string | null>(null);
  const [lastPing, setLastPing] = useState(lastRePingAt);

  const confirmRate = totalGoing > 0 ? Math.round((confirmed / totalGoing) * 100) : 0;

  // Rate limit: 4 hours between re-pings
  const canRePing = !lastPing || (Date.now() - new Date(lastPing).getTime()) > 4 * 60 * 60 * 1000;

  async function handleRePing() {
    if (!canRePing || pending === 0) return;
    setIsRePinging(true);
    setRePingResult(null);

    try {
      const res = await fetch(`/api/events/${eventId}/re-ping`, { method: "POST" });
      const data = await res.json();

      if (data.ok) {
        setRePingResult(t("rePingSent", { count: data.notified }));
        setLastPing(new Date().toISOString());
      } else {
        setRePingResult(data.error || t("rePingError"));
      }
    } catch {
      setRePingResult(t("rePingError"));
    } finally {
      setIsRePinging(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalGoing}</p>
            <p className="text-xs text-muted-foreground">{t("going")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{confirmed}</p>
            <p className="text-xs text-muted-foreground">{t("confirmed")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{pending}</p>
            <p className="text-xs text-muted-foreground">{t("pending")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{cancelled}</p>
            <p className="text-xs text-muted-foreground">{t("cancelled")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-muted-foreground">{t("confirmationRate")}</span>
          <span className="font-medium">{confirmRate}%</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${confirmRate}%` }}
          />
        </div>
      </div>

      {/* Re-ping Button */}
      {pending > 0 && (
        <div className="space-y-2">
          <Button
            onClick={handleRePing}
            disabled={!canRePing || isRePinging}
            className="w-full"
            variant="outline"
          >
            {isRePinging ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 mr-2" />
            )}
            {t("rePingButton", { count: pending })}
          </Button>
          {!canRePing && lastPing && (
            <p className="text-xs text-muted-foreground text-center">
              {t("rePingCooldown")}
            </p>
          )}
          {rePingResult && (
            <p className="text-sm text-center text-muted-foreground">{rePingResult}</p>
          )}
        </div>
      )}

      {/* Confirmed Attendees */}
      {confirmedAttendees.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            {t("confirmedSection")}
          </h3>
          <div className="space-y-2">
            {confirmedAttendees.map((a) => (
              <AttendeeRow
                key={a.user_id}
                attendee={a}
                status="confirmed"
                eventSlug={eventSlug}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending Attendees */}
      {pendingAttendees.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            {t("pendingSection")}
          </h3>
          <div className="space-y-2">
            {pendingAttendees.map((a) => (
              <AttendeeRow
                key={a.user_id}
                attendee={a}
                status="pending"
                eventSlug={eventSlug}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AttendeeRow({
  attendee,
  status,
  eventSlug,
}: {
  attendee: Attendee;
  status: "confirmed" | "pending";
  eventSlug: string;
}) {
  const initials = (attendee.display_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const profileHref = attendee.username
    ? `/${attendee.username}`
    : `/events/${eventSlug}`;

  return (
    <Link
      href={profileHref}
      className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted transition-colors"
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={attendee.avatar_url || undefined} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium flex-1">{attendee.display_name}</span>
      {status === "confirmed" && (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      )}
      {status === "pending" && (
        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
      )}
    </Link>
  );
}
