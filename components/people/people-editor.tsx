import { getLocale, getTranslations } from "next-intl/server";
import { PEOPLE_INTENTIONS, PEOPLE_INTERESTS } from "@/lib/people/constants";
import type { PeopleProfile } from "@/lib/people/types";
import type { ContentLocale } from "@/lib/types";
import { PeopleEditorForm } from "./people-editor-form";

export async function PeopleEditor({ initialProfile, isPrivate }: { initialProfile: PeopleProfile | null; isPrivate: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("people"), getLocale()]);
  return <PeopleEditorForm initialProfile={initialProfile} isPrivate={isPrivate} locale={locale as ContentLocale} copy={{
    enabled: t("enabled"), enabledDescription: t("enabledDescription"), privateHint: t("privateProfileHint"),
    identityDescription: t("editingIdentity"), editIdentity: t("editIdentity"),
    intentionsLabel: t("intentionsLabel"), interestsLabel: t("interests"), languagesLabel: t("languages"),
    intentions: Object.fromEntries(PEOPLE_INTENTIONS.map((key) => [key, t(`intentions.${key}`)])),
    interests: Object.fromEntries(PEOPLE_INTERESTS.map((key) => [key, t(`interestOptions.${key}`)])),
    helpOffered: t("helpOffered"), helpOfferedPlaceholder: t("helpOfferedPlaceholder"),
    helpWanted: t("helpWanted"), helpWantedPlaceholder: t("helpWantedPlaceholder"),
    privacyNotice: t("privacyNotice"), save: t("save"), saving: t("saving"), saved: t("saved"),
    saveError: t("saveError"), translationPending: t("translationPending"), hideNow: t("hideNow"),
    hiding: t("hiding"), hidden: t("hidden"),
  }} />;
}
