import { ArrowUpRight, HandHeart, Sprout } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { PeopleCard } from "@/lib/people/types";
import { getTranslations } from "next-intl/server";
import { PEOPLE_INTENTIONS, PEOPLE_INTERESTS, PEOPLE_LANGUAGES } from "@/lib/people/constants";
import { LOCALE_NAMES } from "@/lib/types";

interface PeopleCardLabels {
  name: string;
  intentions: string[];
  interests: string[];
  languages: string[];
  helpOffered: string;
  helpWanted: string;
  viewProfile: string;
}

export async function PeopleCardView({ person, locale }: { person: PeopleCard; locale: string }) {
  const t = await getTranslations({ locale, namespace: "people" });
  return <PeopleCardBody person={person} labels={{
    name: person.profile.display_name || person.profile.username || t("emptyName"),
    intentions: PEOPLE_INTENTIONS.filter((value) => person.intentions.includes(value)).slice(0, 3).map((value) => t(`intentions.${value}`)),
    interests: PEOPLE_INTERESTS.filter((value) => person.interests.includes(value)).slice(0, 4).map((value) => t(`interestOptions.${value}`)),
    languages: PEOPLE_LANGUAGES.filter((value) => person.languages.includes(value)).map((value) => LOCALE_NAMES[value]),
    helpOffered: t("helpOffered"),
    helpWanted: t("helpWanted"),
    viewProfile: t("viewProfile"),
  }} />;
}

/** Presentation receives translated labels from the server wrapper. */
export function PeopleCardBody({ person, labels }: { person: PeopleCard; labels: PeopleCardLabels }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-border/70 bg-background p-5 transition-colors hover:border-primary/30 sm:p-6">
      <Link
        href={`/${person.profile.username || person.user_id}`}
        className="-m-2 mb-2 flex min-h-11 items-center gap-4 rounded-xl p-2 transition-colors hover:bg-muted/40 active:scale-[0.99]"
      >
        <UserAvatar src={person.profile.avatar_url} alt={labels.name} size="lg" className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold tracking-tight">{labels.name}</h2>
          {labels.intentions.length > 0 && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{labels.intentions.join(" · ")}</p>
          )}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>

      {person.profile.bio && <p className="mb-5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{person.profile.bio}</p>}

      <dl className="space-y-4">
        {person.help_offered && (
          <div>
            <dt className="mb-1 flex items-center gap-2 text-sm font-medium">
              <HandHeart className="h-4 w-4 text-primary" aria-hidden="true" />
              {labels.helpOffered}
            </dt>
            <dd className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">{person.help_offered}</dd>
          </div>
        )}
        {person.help_wanted && (
          <div>
            <dt className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Sprout className="h-4 w-4 text-primary" aria-hidden="true" />
              {labels.helpWanted}
            </dt>
            <dd className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">{person.help_wanted}</dd>
          </div>
        )}
      </dl>

      {labels.interests.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {labels.interests.map((interest) => (
            <li key={interest} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{interest}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-5">
        {labels.languages.length > 0 && <p className="pb-2.5 text-xs text-muted-foreground">{labels.languages.join(" · ")}</p>}
        <Link
          href={`/${person.profile.username || person.user_id}`}
          className="-mr-2 ml-auto flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted active:scale-95"
        >
          {labels.viewProfile}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
