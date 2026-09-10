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
    title: "Phuong + Zan × Dalat.app",
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
      canonical: `https://phuong.dalat.app${locale === "en" ? "/" : `/${locale}`}`,
      languages: {
        en: "https://phuong.dalat.app/",
        vi: "https://phuong.dalat.app/vi",
      },
    },
    openGraph: {
      title: "Phuong + Zan × Dalat.app",
      description: "A collaboration workshop",
      images: [],
    },
    twitter: { card: "summary", title: "Phuong + Zan × Dalat.app", images: [] },
  };
}

export default async function PhuongPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("phuong");
  // Route-specific server dictionary: do not add meeting copy to the global client shell.
  const copy = t.raw("canvas") as WorkshopCopy;
  return <Workshop copy={copy} language={locale === "vi" ? "vi" : "en"} />;
}
