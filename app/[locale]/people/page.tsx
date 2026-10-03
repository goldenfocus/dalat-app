import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { isPeopleEnabled, PEOPLE_INTENTIONS, PEOPLE_LANGUAGES } from "@/lib/people/constants";
import { getPeoplePage, getPeopleViewer } from "@/lib/people/server";
import type { PeopleFilters } from "@/lib/people/types";
import { peopleEventSchema } from "@/lib/people/schema";
import { Button } from "@/components/ui/button";
import { PeopleDiscovery } from "@/components/people/people-discovery";
import { PeopleCardView } from "@/components/people/people-card";
import { PeopleMessage } from "@/components/people/people-message";
import { PeopleRetry } from "@/components/people/people-retry";

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;
interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Query>;
}
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "people" });
  return {
    ...generateLocalizedMetadata({ locale, path: "/people", title: t("heading"), description: t("subheading") }),
    robots: { index: false, follow: false },
  };
}

export default async function PeoplePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("people");
  const unavailable = (
    <div className="container mx-auto max-w-5xl px-4 pb-24">
      <h1 className="sr-only">{t("heading")}</h1>
      <PeopleMessage title={t("unavailableTitle")} description={t("unavailableDescription")}><PeopleRetry label={t("retry")} /></PeopleMessage>
    </div>
  );
  if (!isPeopleEnabled()) return unavailable;

  const query = await searchParams;
  const eventId = first(query.event);
  if (eventId && !peopleEventSchema.safeParse({ event_id: eventId }).success) notFound();
  const rawIntention = first(query.intention);
  const rawLanguage = first(query.language);
  const rawPage = Number(first(query.page) || 1);
  const filters: PeopleFilters = {
    q: first(query.q)?.trim().slice(0, 100),
    intention: PEOPLE_INTENTIONS.find((value) => value === rawIntention),
    language: PEOPLE_LANGUAGES.find((value) => value === rawLanguage),
    page: Number.isFinite(rawPage) ? Math.max(1, Math.min(417, Math.trunc(rawPage))) : 1,
    eventId,
  };

  const viewer = await getPeopleViewer().catch(() => null);
  if (!viewer) return unavailable;
  if (!viewer.user) return (
      <div className="container mx-auto max-w-5xl px-4 pb-24">
        <h1 className="sr-only">{t("heading")}</h1>
        <PeopleMessage title={t("signinTitle")} description={t("signinDescription")}>
          <Button asChild className="min-h-11"><Link href="/auth/login?next=%2Fpeople">{t("signin")}</Link></Button>
        </PeopleMessage>
      </div>
    );
  const result = await getPeoplePage(filters, locale).catch(() => null);
  if (!result) return unavailable;
  const { people, hasMore } = result;
  return (
      <PeopleDiscovery locale={locale} filters={filters} hasMore={hasMore} count={people.length} copy={{
        heading: t("heading"), subheading: t("subheading"), manageProfile: t("manageProfile"),
        privacyNotice: t("privacyNotice"), searchLabel: t("searchLabel"), searchPlaceholder: t("searchPlaceholder"),
        intentionFilter: t("intentionFilter"), languageFilter: t("languageFilter"), allIntentions: t("allIntentions"),
        allLanguages: t("allLanguages"), intentions: Object.fromEntries(PEOPLE_INTENTIONS.map((key) => [key, t(`intentions.${key}`)])),
        applyFilters: t("applyFilters"), clearFilters: t("clearFilters"), noResults: t("noResults"),
        resultCount: t("resultCount", { count: people.length }), previous: t("previous"), next: t("next"),
        browsePeople: t("browsePeople"), eventHeading: t("eventFilterHeading"),
      }}>
        {people.map((person) => <PeopleCardView key={person.user_id} person={person} locale={locale} />)}
      </PeopleDiscovery>
  );
}
