import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { EventPractice } from "@/components/practice/event-practice";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "eventPractice" });
  return { ...generateLocalizedMetadata({ locale: locale as Locale, path: `/events/${slug}/play`, title: t("cardsTitle"), description: t("cardsHint") }), robots: { index: false, follow: false } };
}
export default async function PlayPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider
      messages={{
        eventPractice: messages.eventPractice,
        arrival: messages.arrival,
      }}
    >
      <main className="mx-auto max-w-lg px-3 pb-24 pt-3">
        <EventPractice slug={slug} />
      </main>
    </NextIntlClientProvider>
  );
}
