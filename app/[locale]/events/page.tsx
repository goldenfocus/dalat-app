import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/lib/i18n/routing";
import type { Locale } from "@/lib/i18n/routing";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function EventsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: "/events/upcoming", locale });
}
