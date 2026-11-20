import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { locales } from "@/lib/i18n/locales";
import { rentalReelCaptionKeys, rentalReelWebVtt } from "@/lib/rentals/pilot";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const dynamic = "force-static";
export const dynamicParams = false;

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) return new Response(null, { status: 404 });

  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return new Response(rentalReelWebVtt(rentalReelCaptionKeys.map((key) => t(key))), {
    headers: { "Content-Type": "text/vtt; charset=utf-8" },
  });
}
