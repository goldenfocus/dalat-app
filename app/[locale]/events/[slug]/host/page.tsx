import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { HostWorkspace } from "@/components/arrival/host-workspace";
import { createClient } from "@/lib/supabase/server";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/types";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "arrival" });
  return {
    ...generateLocalizedMetadata({ locale: locale as Locale, path: `/events/${slug}/host`, title: t("hostTitle"), description: t("metaDescription") }),
    robots: { index: false, follow: false },
  };
}

export default async function HostPage({ params }: Props) {
  const { locale, slug } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const returnTo = `${locale === "en" ? "" : `/${locale}`}/events/${encodeURIComponent(slug)}/host`;
    redirect(`/auth/login?next=${encodeURIComponent(returnTo)}`);
  }
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={{ arrival: messages.arrival, translations: messages.translations }}>
      <HostWorkspace slug={slug} />
    </NextIntlClientProvider>
  );
}
