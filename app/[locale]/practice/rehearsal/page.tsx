import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { PracticeRehearsal } from "@/components/practice/practice-rehearsal";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/i18n/routing";

type Props = { params: Promise<{ locale: Locale }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "eventPractice" });
  return { ...generateLocalizedMetadata({ locale, path: "/practice/rehearsal", title: t("rehearsalTitle"), description: t("rehearsalHint") }), robots: { index: false, follow: false } };
}
export default async function RehearsalPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, messages] = await Promise.all([getTranslations("eventPractice"), getMessages()]);
  return <main className="practice-rehearsal-page container mx-auto max-w-2xl space-y-2 px-4 py-5 pb-28">
    <h1 className="text-2xl font-bold tracking-tight">{t("rehearsalTitle")}</h1>
    <NextIntlClientProvider messages={{ eventPractice: messages.eventPractice }}><PracticeRehearsal /></NextIntlClientProvider>
  </main>;
}
