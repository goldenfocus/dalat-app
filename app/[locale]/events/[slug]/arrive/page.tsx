import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { GuestArrival } from "@/components/arrival/guest-arrival";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "arrival" });
  return {
    ...generateLocalizedMetadata({
      locale: locale as Locale,
      path: `/events/${slug}/arrive`,
      title: t("metaTitle"),
      description: t("metaDescription"),
    }),
    robots: { index: false, follow: false },
  };
}

export default async function ArrivalPage({ params }: Props) {
  const { locale, slug } = await params;
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider messages={{ arrival: messages.arrival, translations: messages.translations }}>
      <GuestArrival slug={slug} />
    </NextIntlClientProvider>
  );
}
