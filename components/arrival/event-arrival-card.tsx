import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

/** The one action for someone at the door. The drink summary already sits in the RSVP block above. */
export async function EventArrivalCard({ slug }: { slug: string }) {
  const t = await getTranslations("arrival");
  return <Button asChild className="event-join-action min-h-12 w-full"><Link href={`/events/${slug}/arrive`}>{t("checkIn")}</Link></Button>;
}
