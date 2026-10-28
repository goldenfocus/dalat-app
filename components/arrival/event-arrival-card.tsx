import { getTranslations } from "next-intl/server";
import { QrCode, Users } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

export async function EventArrivalCard({ slug }: { slug: string }) {
  const t = await getTranslations("arrival");
  return <section className="space-y-3 rounded-xl border bg-card p-4">
    <div className="flex items-center gap-3">
      <QrCode className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <h2 className="font-semibold">{t("welcome")}</h2>
    </div>
    <Button asChild className="min-h-12 w-full"><Link href={`/events/${slug}/arrive`}>{t("checkIn")}</Link></Button>
    <Link href={`/events/${slug}/host`} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline">
      <Users className="h-4 w-4" aria-hidden />{t("hostTitle")}
    </Link>
  </section>;
}
