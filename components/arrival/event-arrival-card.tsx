import { getTranslations } from "next-intl/server";
import { QrCode } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { EventDrinkAction } from "./event-drink-action";
import type { DrinkSelection } from "@/lib/arrival/drink-selection";

export async function EventArrivalCard({ slug, selection }: { slug: string; selection: DrinkSelection | undefined }) {
  const t = await getTranslations("arrival");
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <div className="flex items-center gap-3">
      <QrCode className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="font-semibold">{t("welcome")}</h2>
    </div>
    <EventDrinkAction slug={slug} selection={selection} />
    <Button asChild className="min-h-12 w-full"><Link href={`/events/${slug}/arrive`}>{t("checkIn")}</Link></Button>
  </section>;
}
