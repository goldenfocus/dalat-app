import { getTranslations } from "next-intl/server";
import type { PeopleBlock } from "@/lib/people/types";
import { BlockedPeopleList } from "./blocked-people-list";
import { getPeopleActionCopy } from "./people-actions";

export async function BlockedPeople({ initialBlocks }: { initialBlocks: PeopleBlock[] }) {
  const t = await getTranslations("people");
  return <BlockedPeopleList initialBlocks={initialBlocks} reportCopy={await getPeopleActionCopy()} copy={{
    heading: t("blockedPeople"), scope: t("blockScope"), empty: t("noBlockedPeople"),
    emptyName: t("emptyName"), unblock: t("unblock"), unblocking: t("unblocking"),
    success: t("unblockedSuccess"), error: t("actionError"),
  }} />;
}
