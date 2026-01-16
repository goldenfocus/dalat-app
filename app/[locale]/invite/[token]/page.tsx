import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import type { Metadata } from "next";
import { Calendar, MapPin, Check, X, HelpCircle, Download, ArrowRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatInDaLat } from "@/lib/timezone";
import { InviteRsvpButtons } from "./rsvp-buttons";
import type { Locale } from "@/lib/types";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;

  // Fetch invitation to get event title
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/invite/${token}`,
    { next: { revalidate: 60 } }
  );

  if (!response.ok) {
    return { title: "Invitation" };
  }

  const data = await response.json();

  return {
    title: `You're invited to ${data.event.title} | dalat.app`,
    description: `${data.inviter.name} invited you to ${data.event.title}`,
  };
}

async function getInvitation(token: string) {
  const supabase = await createClient();

  const { data: invitation, error } = await supabase
    .from("event_invitations")
    .select(`
      id,
      email,
      name,
      status,
      rsvp_status,
      claimed_by,
      responded_at,
      events (
        id,
        slug,
        title,
        description,
        image_url,
        location_name,
        address,
        google_maps_url,
        starts_at,
        ends_at,
        timezone,
        status
      ),
      profiles:invited_by (
        display_name,
        username,
        avatar_url
      )
    `)
    .eq("token", token)
    .single();

  if (error || !invitation) {
    return null;
  }

  // Mark as viewed if first time
  if (invitation.status === "sent") {
    await supabase
      .from("event_invitations")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("token", token);
  }

  return invitation;
}

export default async function InvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const [t, locale] = await Promise.all([
    getTranslations("invite"),
    getLocale(),
  ]);

  const invitation = await getInvitation(token);

  if (!invitation) {
    notFound();
  }

  // Type assertions for Supabase joined data
  type EventData = {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    image_url: string | null;
    location_name: string | null;
    address: string | null;
    google_maps_url: string | null;
    starts_at: string;
    ends_at: string | null;
    timezone: string;
    status: string;
  };

  type InviterData = {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };

  const event = invitation.events as unknown as EventData;
  const inviter = invitation.profiles as unknown as InviterData;

  if (!event || event.status === "cancelled") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <X className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">{t("eventCancelled")}</h1>
            <p className="text-muted-foreground">{t("eventNoLongerAvailable")}</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const inviterName = inviter?.display_name || inviter?.username || "Someone";
  const guestName = invitation.name || invitation.email.split("@")[0];
  const hasResponded = invitation.rsvp_status !== null;

  // Handle auto-RSVP from email link
  const autoRsvp = query.rsvp as string | undefined;

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="container max-w-lg mx-auto px-4 py-8">
        {/* Event image */}
        {event.image_url && (
          <div className="rounded-xl overflow-hidden mb-6 shadow-lg">
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full h-48 object-cover"
            />
          </div>
        )}

        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-6">
            {/* Invitation header */}
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">
                {t("invitedBy", { name: inviterName })}
              </p>
              <h1 className="text-2xl font-bold">{event.title}</h1>
            </div>

            {/* Event details */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">
                    {formatInDaLat(event.starts_at, "EEEE, MMMM d", locale as Locale)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatInDaLat(event.starts_at, "h:mm a", locale as Locale)}
                    {event.ends_at && ` - ${formatInDaLat(event.ends_at, "h:mm a", locale as Locale)}`}
                  </p>
                </div>
              </div>

              {(event.location_name || event.address) && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    {event.location_name && (
                      <p className="font-medium">{event.location_name}</p>
                    )}
                    {event.address && (
                      <p className="text-sm text-muted-foreground">{event.address}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {event.description && (
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {event.description}
              </p>
            )}

            <hr />

            {/* RSVP section */}
            {hasResponded ? (
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
                  {invitation.rsvp_status === "going" && (
                    <>
                      <Check className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-600">{t("responseGoing")}</span>
                    </>
                  )}
                  {invitation.rsvp_status === "interested" && (
                    <>
                      <HelpCircle className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-600">{t("responseMaybe")}</span>
                    </>
                  )}
                  {invitation.rsvp_status === "cancelled" && (
                    <>
                      <X className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium text-muted-foreground">{t("responseNotGoing")}</span>
                    </>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  {t("canChangeResponse")}
                </p>

                <InviteRsvpButtons
                  token={token}
                  currentResponse={invitation.rsvp_status}
                  compact
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-center font-medium">
                  {t("willYouAttend", { name: guestName })}
                </p>
                <InviteRsvpButtons
                  token={token}
                  currentResponse={null}
                  autoRsvp={autoRsvp}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                />
              </div>
            )}

            <hr />

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <a
                href={`/api/invite/${token}/calendar.ics`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Download className="w-4 h-4" />
                {t("addToCalendar")}
              </a>

              <Link
                href={`/events/${event.slug}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-primary hover:underline"
              >
                {t("viewEventPage")}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("poweredBy")}{" "}
          <Link href="/" className="text-primary hover:underline">
            dalat.app
          </Link>
        </p>
      </div>
    </main>
  );
}
