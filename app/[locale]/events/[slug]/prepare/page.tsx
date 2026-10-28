import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventPreparation } from "@/components/arrival/event-preparation";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "arrival.registration" });
  return { ...generateLocalizedMetadata({ locale: locale as Locale, path: `/events/${slug}/prepare`, title: t("prepare"), description: t("intro") }), robots: { index: false, follow: false } };
}
export default async function PreparationPage({ params }: Props) {
  const { locale, slug } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`${locale === "en" ? "" : `/${locale}`}/events/${slug}/prepare`)}`);
  const messages = await getMessages({ locale });
  return <NextIntlClientProvider messages={{ arrival: messages.arrival, translations: messages.translations }}><EventPreparation slug={slug} /></NextIntlClientProvider>;
}
