import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Workshop } from "./workshop";
import type { WorkshopCopy } from "./workshop";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Thu + Zan × Dalat.app",
    description:
      locale === "vi"
        ? "Cùng tìm một điều đáng thử."
        : "Find one thing worth trying together.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    alternates: {
      canonical: `https://dalat.app${locale === "en" ? "" : `/${locale}`}/thu`,
      languages: {
        en: "https://dalat.app/thu",
        vi: "https://dalat.app/vi/thu",
      },
    },
    openGraph: {
      title: "Thu + Zan × Dalat.app",
      description: "A collaboration workshop",
      images: [],
    },
    twitter: { card: "summary", title: "Thu + Zan × Dalat.app", images: [] },
  };
}

export default async function ThuPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("thu");
  // Route-specific server dictionary: do not add meeting copy to the global client shell.
  const copy = t.raw("canvas") as WorkshopCopy;
  return <Workshop copy={copy} language={locale === "vi" ? "vi" : "en"} />;
}
