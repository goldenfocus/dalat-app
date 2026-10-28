import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { staffEvents } from "@/lib/arrival/staff-events";
import { createClient } from "@/lib/supabase/server";
import { translatedRecords } from "@/lib/translations/public-content";
import { OriginalText } from "@/components/ui/original-text";
import { formatInDaLatAsync } from "@/lib/timezone";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: Locale }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "arrival" });
  return {
    ...generateLocalizedMetadata({ locale, path: "/staff", title: t("staffDesk"), description: t("hostTitle") }),
    robots: { index: false, follow: false },
  };
}

export default async function StaffPage({ params }: Props) {
  const { locale } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`${locale === "en" ? "" : `/${locale}`}/staff`)}`);
  const [events, t] = await Promise.all([staffEvents(), getTranslations({ locale, namespace: "arrival" })]);
  const translations = await translatedRecords("event", events.map(event => event.id), locale);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <ClipboardCheck className="mb-4 h-8 w-8 text-primary" aria-hidden="true" />
      <h1 className="text-3xl font-semibold tracking-tight">{t("staffDesk")}</h1>
      <p className="mt-2 text-muted-foreground">{t("hostArrivals")} · {t("hostOrders")}</p>
      <div className="mt-8 space-y-4">
        {events.length === 0 && <p className="rounded-xl border p-6 text-muted-foreground">{t("noStaffEvents")}</p>}
        {await Promise.all(events.map(async event => {
          const title = translations.get(event.id)?.get("title") || event.title;
          return (
            <section key={event.id} className="rounded-xl border bg-card p-5">
              <Link href={`/events/${event.slug}/host`} className="group flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold group-hover:text-primary">{title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{await formatInDaLatAsync(event.starts_at, "EEEE, MMMM d · HH:mm", locale)}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </Link>
              {title !== event.title && <OriginalText text={event.title} />}
            </section>
          );
        }))}
      </div>
    </main>
  );
}
