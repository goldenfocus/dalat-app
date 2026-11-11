import type { Metadata } from "next";
import {
  getTranslations,
  getMessages,
  setRequestLocale,
} from "next-intl/server";
import { DatingApp } from "@/components/dating/dating-app";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/i18n/routing";
import type { DatingCopy } from "@/lib/dating/live-types";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dating" });
  return generateLocalizedMetadata({
    locale,
    path: "/dating",
    title: t("title"),
    description: t("description"),
    image: "https://dalat.app/dating-art/coffee-date.webp",
  });
}
export default async function DatingPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  return <DatingApp locale={locale} copy={messages.dating as DatingCopy} />;
}
