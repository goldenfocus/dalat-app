import { getTranslations } from "next-intl/server";
import { UtensilsCrossed } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getPublicMenu } from "@/lib/menu/queries";
import { formatVnd } from "@/lib/menu/format";
import { PreorderPanel, type ExistingPreorder } from "./preorder-panel";

/**
 * "Preorder from the menu" card for events held at a venue that publishes a
 * menu and has preorders switched on. Renders nothing otherwise.
 */
export async function EventPreorderCard({
  eventId,
  eventSlug,
  venue,
  startsAt,
  endsAt,
  locale,
}: {
  eventId: string;
  eventSlug: string;
  venue: { id: string; slug: string; name: string };
  startsAt: string;
  endsAt: string | null;
  locale: string;
}) {
  // Mirrors create_event_preorder(): open until the event ends (6h default).
  const closesAt = endsAt ? new Date(endsAt) : new Date(new Date(startsAt).getTime() + 6 * 3600_000);
  if (closesAt.getTime() <= Date.now()) return null;

  const db = await createClient();
  const [{ data: v }, { data: ev }, sections, { data: auth }] = await Promise.all([
    db.from("venues").select("preorder_enabled").eq("id", venue.id).maybeSingle(),
    db.from("events").select("tribe_id,tribe_visibility").eq("id", eventId).maybeSingle(),
    getPublicMenu(venue.id, locale),
    db.auth.getUser(),
  ]);
  if (!v?.preorder_enabled || sections.length === 0) return null;
  // Tribe-only events: venue staff can't see them, so create_event_preorder refuses them.
  if (!ev || (ev.tribe_id && ev.tribe_visibility !== "public")) return null;

  let existing: ExistingPreorder | null = null;
  if (auth.user) {
    const { data, error } = await db
      .from("event_preorders")
      .select("id,status,total_vnd,note,phone,event_preorder_items(menu_item_id,qty)")
      .eq("event_id", eventId)
      .eq("user_id", auth.user.id)
      .in("status", ["pending", "confirmed"])
      .maybeSingle();
    // Without the existing order the guest could unknowingly replace it — hide the card instead.
    if (error) {
      console.error("EventPreorderCard: loading existing preorder failed", error);
      return null;
    }
    if (data) {
      const { event_preorder_items, ...rest } = data as typeof data & {
        event_preorder_items: ExistingPreorder["items"];
      };
      existing = { ...(rest as Omit<ExistingPreorder, "items">), items: event_preorder_items ?? [] };
    }
  }

  const t = await getTranslations("venueMenu");
  const loginHref = `/auth/login?next=${encodeURIComponent(`/events/${eventSlug}`)}`;

  return (
    <Card id="preorder">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <UtensilsCrossed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="font-semibold">{t("preorderTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("preorderHint", { venue: venue.name })}</p>
          </div>
        </div>

        {existing && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {t("yourPreorder")} · <span className="font-semibold">{formatVnd(existing.total_vnd, locale)}</span> ·{" "}
            {t(existing.status === "confirmed" ? "statusConfirmed" : "statusPending")}
          </p>
        )}

        <PreorderPanel
          eventId={eventId}
          venueName={venue.name}
          sections={sections}
          isLoggedIn={!!auth.user}
          loginHref={loginHref}
          existing={existing}
        />

        <Link
          href={`/venues/${venue.slug}/menu`}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline"
        >
          {t("viewFullMenu")}
        </Link>
      </CardContent>
    </Card>
  );
}
