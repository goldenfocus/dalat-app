import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { isPeopleEnabled, PEOPLE_INTENTIONS, PEOPLE_INTERESTS, PEOPLE_LANGUAGES } from "@/lib/people/constants";
import { getPeopleProfile, getPeopleViewer } from "@/lib/people/server";
import { LOCALE_NAMES } from "@/lib/types";
import { PeopleActions } from "./people-actions";
import { PeopleRetry } from "./people-retry";

export async function PeopleProfileSection({ userId, locale }: { userId: string; locale: string }) {
  if (!isPeopleEnabled()) return null;
  const t = await getTranslations({ locale, namespace: "people" });
  const unavailable = <section className="mt-8 space-y-3 rounded-xl border border-border p-5"><h2 className="font-semibold">{t("unavailableTitle")}</h2><p className="text-sm text-muted-foreground">{t("unavailableDescription")}</p><PeopleRetry label={t("retry")} /></section>;
  const viewer = await getPeopleViewer().catch(() => null);
  if (!viewer) return unavailable;
  if (!viewer.user) return null;
  const result = await getPeopleProfile(userId, locale).then((person) => ({ person })).catch(() => null);
  if (!result) return unavailable;
  const { person } = result;
  if (!person) return null;
    const intentions = PEOPLE_INTENTIONS.filter((value) => person.intentions.includes(value));
    const interests = PEOPLE_INTERESTS.filter((value) => person.interests.includes(value));
    const languages = PEOPLE_LANGUAGES.filter((value) => person.languages.includes(value));
    return (
      <section className="mt-8 rounded-2xl border border-border p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("heading")}</h2>
          {viewer.user.id === userId && <Link href="/people/edit" className="-mr-2 flex min-h-11 items-center rounded-lg px-2 text-sm font-medium hover:bg-muted active:scale-95">{t("editProfile")}</Link>}
        </div>
        <dl className="space-y-5">
          {intentions.length > 0 && <div><dt className="mb-2 text-sm font-medium">{t("intentionsLabel")}</dt><dd className="text-sm leading-relaxed text-muted-foreground">{intentions.map((value) => t(`intentions.${value}`)).join(" · ")}</dd></div>}
          {person.help_offered && <div><dt className="mb-1 text-sm font-medium">{t("helpOffered")}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{person.help_offered}</dd></div>}
          {person.help_wanted && <div><dt className="mb-1 text-sm font-medium">{t("helpWanted")}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{person.help_wanted}</dd></div>}
          {interests.length > 0 && <div><dt className="mb-2 text-sm font-medium">{t("interests")}</dt><dd className="flex flex-wrap gap-2">{interests.map((value) => <span key={value} className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">{t(`interestOptions.${value}`)}</span>)}</dd></div>}
          {languages.length > 0 && <div><dt className="mb-1 text-sm font-medium">{t("languages")}</dt><dd className="text-sm text-muted-foreground">{languages.map((value) => LOCALE_NAMES[value]).join(" · ")}</dd></div>}
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t("privacyNotice")}</p>
        {viewer.user.id !== userId && <PeopleActions userId={userId} />}
      </section>
    );
}
