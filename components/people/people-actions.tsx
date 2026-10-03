import { getTranslations } from "next-intl/server";
import { PEOPLE_REPORT_REASONS } from "@/lib/people/constants";
import { PeopleActionsClient } from "./people-actions-client";

export async function getPeopleActionCopy() {
  const t = await getTranslations("people");
  return {
    block: t("block"), blocking: t("blocking"), blockConfirm: t("blockConfirm"), blockScope: t("blockScope"),
    blockedSuccess: t("blockedSuccess"), actionError: t("actionError"), report: t("report"),
    reportTitle: t("reportTitle"), reportReason: t("reportReason"), reportDetails: t("reportDetails"),
    reportDetailsPlaceholder: t("reportDetailsPlaceholder"), submitReport: t("submitReport"),
    submittingReport: t("submittingReport"), reportSuccess: t("reportSuccess"), reportError: t("reportError"),
    reportReasons: Object.fromEntries(PEOPLE_REPORT_REASONS.map((key) => [key, t(`reportReasons.${key}`)])),
    cancel: t("cancel"),
  };
}

export async function PeopleActions({ userId }: { userId: string }) {
  return <PeopleActionsClient userId={userId} copy={await getPeopleActionCopy()} />;
}
