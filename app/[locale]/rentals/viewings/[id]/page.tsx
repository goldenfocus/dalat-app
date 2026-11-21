import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { buildAlternates, localeUrl } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { rentalId, type RentalViewingThread } from "@/lib/rentals/data";
import { halfHour } from "@/lib/rentals/calendar";
import { readRentalSlots } from "@/lib/rentals/read-slots";
import { rentalDirectionLinks, rentalDirectionsColumns, type RentalDirections } from "@/lib/rentals/directions";
import { AddToCalendar } from "@/components/events/add-to-calendar";
import { RentalDirectionsPanel } from "@/components/rentals/directions";
import { ViewingPicker } from "@/components/rentals/viewing-picker";
import { answerViewingTime, changeViewingStatus, offerReplacementViewing, proposeViewingTime, sendViewingMessage } from "./actions";

type Props = {
  params: Promise<{ locale: Locale; id: string }>;
  searchParams: Promise<{ requested?: string; error?: string; history?: string }>;
};
type Event = {
  id: string;
  kind: "message" | "requested" | "proposed" | "confirmed" | "declined" | "cancelled" | "request_changed"
    | "reschedule_proposed" | "rescheduled" | "reschedule_withdrawn" | "reschedule_kept" | "decline_reason";
  actor_id: string | null;
  starts_at: string | null;
  recorded_at: string;
  body: string | null;
};
type Proposal = { proposed_by: string; starts_at: string };
const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-medium text-primary-foreground";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2";
const input = "mt-1 min-h-11 w-full rounded-lg border bg-background px-3 py-2";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return { title: t("viewings"), alternates: buildAlternates(locale, "/rentals/viewings/" + id),
    robots: { index: false, follow: false }, openGraph: null, twitter: null };
}

function currentTime() {
  return new Date().getTime();
}

export default async function RentalViewingThread({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  if (!rentalId.safeParse(id).success) notFound();
  const [db, feedback, t, common] = await Promise.all([
    createClient(), searchParams, getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }),
  ]);
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const next = (locale === "en" ? "" : "/" + locale) + "/rentals/viewings/" + id;
    return redirect({ href: "/auth/login?next=" + encodeURIComponent(next), locale });
  }
  const result = await db.from("rental_visits").select("id,listing_id,renter_id,slot_id,starts_at,status,archived_listing_id").eq("id", id).maybeSingle();
  const visit = result.data as RentalViewingThread | null;
  if (!visit) notFound();
  const isHost = visit.renter_id !== user.id;
  const listingId = visit.listing_id;
  const threadListingId = listingId ?? visit.archived_listing_id;
  if (!threadListingId) notFound();
  const publicListing = listingId ? "/rentals/listing/" + listingId : null;
  const thread = "/rentals/viewings/" + id;
  const now = currentTime();
  const upcoming = !visit.starts_at || Date.parse(visit.starts_at) > now;
  const history = z.coerce.number().int().min(0).max(10_000).safeParse(feedback.history ?? 0);
  const page = history.success ? history.data : 0;
  const pageSize = 60;
  const [listingResult, proposed, directions, eventsResult, translated] = await Promise.all([
    listingId ? db.from("rental_listings").select("title,status").eq("id", listingId).maybeSingle() : null,
    listingId && visit.status === "confirmed"
      ? db.from("rental_reschedules").select("proposed_by,starts_at").eq("visit_id", id).maybeSingle()
      : null,
    listingId && visit.status === "confirmed"
      ? db.from("rental_directions").select(rentalDirectionsColumns).eq("listing_id", listingId).maybeSingle()
      : null,
    db.from("rental_visit_events")
      .select("id,actor_id,kind,starts_at,body,recorded_at,visit:rental_visits!inner(listing_id,archived_listing_id,renter_id)")
      .eq(listingId ? "visit.listing_id" : "visit.archived_listing_id", threadListingId)
      .eq("visit.renter_id", visit.renter_id)
      .order("recorded_at", { ascending: false }).order("id", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize),
    listingId ? translatedRecords("rental", [listingId], locale).catch(() => new Map()) : null,
  ]);
  const listing = listingResult?.data;
  const savedDirections = directions?.data as RentalDirections | undefined;
  const place = savedDirections ? rentalDirectionLinks(savedDirections) : null;
  const proposal = proposed?.data as Proposal | null;
  const pendingProposal = proposal && upcoming && Date.parse(proposal.starts_at) > now ? proposal : null;
  const canMove = upcoming && listing?.status === "published" && !pendingProposal &&
    (visit.status === "confirmed" || (!isHost && visit.status === "pending"));
  const slots = listingId && canMove && !isHost
    ? await readRentalSlots((from, to) => db.rpc("rental_open_times", { listing: listingId }).order("starts_at").range(from, to))
    : [];
  const choices = slots?.filter(slot => slot.starts_at !== visit.starts_at) ?? [];
  const canPropose = listingId && isHost && (visit.status === "pending" || visit.status === "proposed");
  const canConfirm = listingId && upcoming && ((isHost && visit.status === "pending" && !!visit.starts_at) || (!isHost && visit.status === "proposed"));
  const canCancel = listingId && upcoming && ["pending", "proposed", "confirmed"].includes(visit.status);
  const closed = visit.status === "declined" || visit.status === "cancelled";
  const canOfferReplacement = isHost && closed && listing?.status === "published";
  const canRebook = !isHost && listing?.status === "published" && (!upcoming || closed);
  const tDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const format = (at: string) => tDate.format(new Date(at));
  const title = listing && listingId ? translated?.get(listingId)?.get("title") || listing.title : t("viewings");
  const all = (eventsResult.data ?? []) as Event[];
  const events = all.slice(0, pageSize).reverse();
  const statusAction = changeViewingStatus.bind(null, id);
  const proposalAction = proposeViewingTime.bind(null, id);
  const updateError = eventsResult.error || proposed?.error || slots === null;
  return <article className="mx-auto w-full max-w-2xl space-y-5 px-4 py-5 sm:px-8 sm:py-8">
    <RentalLocaleLink locale={locale} href="/rentals#viewings" className={secondary}>{t("viewings")}</RentalLocaleLink>
    <header className="space-y-1">
      <h1 data-rentals-title className="break-words text-3xl sm:text-4xl">{listing && publicListing ? <RentalLocaleLink locale={locale} href={publicListing}>{title}</RentalLocaleLink> : title}</h1>
      <p className="font-semibold">{t(visit.status)}{visit.starts_at && " · " + format(visit.starts_at)}</p>
    </header>
    {feedback.requested && <p role="status" className="rounded-lg border border-primary p-3">{t("requested")}</p>}
    {(feedback.error || updateError) && <p role="alert" className="rounded-lg border p-3">{t("viewingUpdateFailed")}</p>}
    {pendingProposal && <section className="space-y-3 rounded-xl border p-3 sm:p-4">
      <p>{t("reschedule_proposed")} · <strong>{format(pendingProposal.starts_at)}</strong></p>
      <p className="text-sm text-muted-foreground">{t("currentTimeHeld")}</p>
      <form action={answerViewingTime.bind(null, id)} className="flex flex-wrap gap-2">
        {pendingProposal.proposed_by === user.id
          ? <button name="decision" value="withdraw" className={secondary}>{t("withdrawProposal")}</button>
          : <>
            <button name="decision" value="accept" className={primary}>{t("acceptTime")}</button>
            <button name="decision" value="keep" className={secondary}>{t("keepTime")}</button>
          </>}
      </form>
    </section>}
    {savedDirections && <RentalDirectionsPanel locale={locale} directions={savedDirections} />}
    {visit.status === "confirmed" && upcoming && visit.starts_at && (
      <div className="w-fit">
        <AddToCalendar title={listing ? t("calendarViewing", { title }) : t("viewingTime")} startsAt={visit.starts_at}
          endsAt={new Date(Date.parse(visit.starts_at) + halfHour).toISOString()}
          url={localeUrl(locale, thread)} uid={`rental-viewing-${id}@dalat.app`}
          address={place?.address} googleMapsUrl={place?.map}
          pageLabel={t("viewings")} locationLabel={t("directions")} />
      </div>
    )}
    {canConfirm && <form action={statusAction}>
      <button name="next" value="confirmed" className={primary}>{t("confirm")}</button>
    </form>}
    {(canPropose || (canMove && (isHost || choices.length > 0)) || canCancel || canRebook || canOfferReplacement) && listingId &&
      <div className="flex flex-col gap-2">
        {canRebook && publicListing && <RentalLocaleLink locale={locale} href={publicListing} className={primary}>{t("rebook")}</RentalLocaleLink>}
        {(canPropose || (canMove && (isHost || choices.length > 0))) && <details className="rounded-lg border p-3">
          <summary className="min-h-9 cursor-pointer font-medium">{canPropose ? t("proposeNewTime") : t("reschedule")}</summary>
          {isHost ? <form action={canPropose ? statusAction : proposalAction} className="space-y-3">
            <label className="block">{t("viewingTime")}<input required className={input} type="datetime-local" name="proposed_time" /></label>
            <button name="next" value="proposed" className={primary}>{t("propose")}</button>
          </form> : <ViewingPicker listing={listingId} slots={choices} locale={locale}
            title={t("viewingTime")} action={visit.status === "pending" ? t("changeRequestedTime") : t("propose")}
            formAction={proposalAction} />}
        </details>}
        {canOfferReplacement && <details className="rounded-lg border p-3">
          <summary className="min-h-9 cursor-pointer font-medium">{t("proposeNewTime")}</summary>
          <form action={offerReplacementViewing.bind(null, id)} className="space-y-3">
            <label className="block">{t("viewingTime")}<input required className={input} type="datetime-local" name="proposed_time" /></label>
            <button className={primary}>{t("propose")}</button>
          </form>
        </details>}
        {canPropose && <details className="rounded-lg border p-3">
          <summary className="min-h-9 cursor-pointer font-medium">{common("reject")}</summary>
          <form action={statusAction} className="space-y-2">
            <label className="block">{t("decline_reason")}<textarea className={input} name="reason" maxLength={250} rows={2} /></label>
            {listing?.status === "published" && <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="unlist" />{t("unpublish")}
            </label>}
            <button name="next" value="declined" className={secondary}>{common("reject")}</button>
          </form>
        </details>}
        {canCancel && <details className="rounded-lg border p-3">
          <summary className="min-h-9 cursor-pointer font-medium">{t("cancelViewing")}</summary>
          <form action={statusAction}>
            <button name="next" value="cancelled" className={secondary}>{t("cancelViewing")}</button>
          </form>
        </details>}
      </div>}
    <section className="space-y-3 border-t pt-4">
      <h2 className="text-xl font-semibold">{t("viewingHistory")}</h2>
      <div className="flex flex-wrap gap-2">
        {all.length > pageSize && <RentalLocaleLink locale={locale} href={thread + "?history=" + (page + 1)} className={secondary}>{t("olderHistory")}</RentalLocaleLink>}
        {page > 0 && <RentalLocaleLink locale={locale} href={thread + (page === 1 ? "" : "?history=" + (page - 1))} className={secondary}>{t("newerHistory")}</RentalLocaleLink>}
      </div>
      <ol className="space-y-2">
        {events.map(event => <li key={event.id}
          className={"w-fit max-w-[95%] space-y-1 rounded-xl px-3 py-2 " + (event.kind === "message" && event.actor_id === user.id ? "ms-auto bg-primary/10" : "bg-muted")}>
          <p className="text-xs text-muted-foreground">
            {event.actor_id && ((event.actor_id === visit.renter_id ? t("viewingRenter") : t("viewingHost")) + " · ")}
            <time dateTime={event.recorded_at}>{format(event.recorded_at)}</time>
          </p>
          {event.kind !== "message" && <p>{t(event.kind)}{event.starts_at && " · " + format(event.starts_at)}</p>}
          {event.body && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{event.body}</p>}
        </li>)}
      </ol>
      {page === 0 && <form action={sendViewingMessage.bind(null, id)} className="space-y-2">
        <label className="block">{t("viewingMessage")}<textarea className={input} name="body" required maxLength={2000} rows={2} /></label>
        <button className={primary}>{t("sendViewingMessage")}</button>
      </form>}
    </section>
  </article>;
}
