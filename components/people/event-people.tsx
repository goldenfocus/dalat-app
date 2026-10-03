import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { isPeopleEnabled } from "@/lib/people/constants";
import { getEventPeople, getPeopleViewer } from "@/lib/people/server";
import { PeopleCardView } from "./people-card";
import { EventPeopleToggle } from "./event-people-toggle";
import { PeopleRetry } from "./people-retry";

export async function EventPeople({ eventId, locale }: { eventId: string; locale: string }) {
  if (!isPeopleEnabled()) return null;
  const t = await getTranslations({ locale, namespace: "people" });
  const unavailable = <section className="space-y-3 rounded-xl border border-border p-5"><h2 className="font-semibold">{t("unavailableTitle")}</h2><p className="text-sm text-muted-foreground">{t("unavailableDescription")}</p><PeopleRetry label={t("retry")} /></section>;
  const viewer = await getPeopleViewer().catch(() => null);
  if (!viewer) return unavailable;
  if (!viewer.user) return null;
  const result = await getEventPeople(eventId, locale).catch(() => null);
  if (!result) return unavailable;
  const { people, joined, canJoin } = result;
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("eventHeading")}</h2>
          <Link href={`/people?event=${encodeURIComponent(eventId)}`} className="-mr-2 flex min-h-11 items-center rounded-lg px-2 text-sm font-medium hover:bg-muted active:scale-95">{t("browsePeople")}</Link>
        </div>
        <EventPeopleToggle key={`${eventId}:${joined}`} eventId={eventId} joined={joined} canJoin={canJoin} copy={{
          share: t("shareAtEvent"), description: t("eventSharingDescription"), attendeeNotice: t("eventAttendeeNotice"),
          required: t("eventRsvpRequired"), shared: t("eventShared"), unshared: t("eventUnshared"), error: t("actionError"),
        }} />
        {!canJoin && !joined && <Link href="/people/edit" className="flex min-h-11 w-fit items-center rounded-lg px-3 text-sm font-medium hover:bg-muted active:scale-95">{t("manageProfile")}</Link>}
        {people.length > 0
          ? <div className="grid gap-4 sm:grid-cols-2">{people.slice(0, 4).map((person) => <PeopleCardView key={person.user_id} person={person} locale={locale} />)}</div>
          : <p className="py-3 text-sm leading-relaxed text-muted-foreground">{t("eventEmpty")}</p>}
      </section>
    );
}
