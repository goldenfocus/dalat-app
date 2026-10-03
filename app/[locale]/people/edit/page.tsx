import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";
import { isPeopleEnabled } from "@/lib/people/constants";
import { getOwnPeopleProfile, getPeopleBlocks, getPeopleViewer } from "@/lib/people/server";
import { Button } from "@/components/ui/button";
import { PeopleEditor } from "@/components/people/people-editor";
import { BlockedPeople } from "@/components/people/blocked-people";
import { PeopleMessage } from "@/components/people/people-message";
import { PeopleRetry } from "@/components/people/people-retry";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "people" });
  return {
    ...generateLocalizedMetadata({ locale, path: "/people/edit", title: t("manageProfile"), description: t("editDescription") }),
    robots: { index: false, follow: false },
  };
}

export default async function PeopleEditPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("people");
  const unavailable = <PeopleMessage title={t("unavailableTitle")} description={t("unavailableDescription")}><PeopleRetry label={t("retry")} /></PeopleMessage>;
  let content;
  if (!isPeopleEnabled()) {
    content = unavailable;
  } else {
    const viewer = await getPeopleViewer().catch(() => null);
    if (!viewer) {
      content = unavailable;
    } else {
      const { user, profile } = viewer;
      if (!user) {
        content = <PeopleMessage title={t("signinTitle")} description={t("signinDescription")}><Button asChild className="min-h-11"><Link href="/auth/login?next=%2Fpeople%2Fedit">{t("signin")}</Link></Button></PeopleMessage>;
      } else if (!profile || profile.is_ghost) {
        content = <PeopleMessage title={t("profileMissingTitle")}><Button asChild className="min-h-11"><Link href="/settings/profile">{t("editIdentity")}</Link></Button></PeopleMessage>;
      } else {
        const result = await Promise.all([getOwnPeopleProfile(), getPeopleBlocks()]).catch(() => null);
        content = result ? <div className="space-y-10"><PeopleEditor initialProfile={result[0]} isPrivate={profile.is_private} /><BlockedPeople initialBlocks={result[1]} /></div> : unavailable;
      }
    }
  }
  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 pb-28 sm:py-10 sm:pb-28">
      <Link href="/people" className="-ml-3 mb-5 flex min-h-11 w-fit items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-foreground active:scale-95 active:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span>{t("back")}</span></Link>
      <header className="mb-8"><h1 className="text-3xl font-semibold tracking-tight">{t("setupTitle")}</h1><p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("setupDescription")}</p></header>
      {content}
    </div>
  );
}
