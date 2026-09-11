import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Workshop } from "../../workshop";
import type { WorkshopCopy } from "../../workshop";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Phương + Zan × Dalat.app",
    description:
      locale === "vi"
        ? "Cùng tìm một điều đáng thử."
        : locale === "fr" ? "Trouvons une chose qui mérite d’être essayée ensemble." : "Find one thing worth trying together.",
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    alternates: {
      canonical: `https://phuong.dalat.app${locale === "en" ? "" : `/${locale}`}/archive/v1`,
      languages: {
        en: "https://phuong.dalat.app/archive/v1",
        vi: "https://phuong.dalat.app/vi/archive/v1",
        fr: "https://phuong.dalat.app/fr/archive/v1",
      },
    },
    openGraph: {
      title: "Phương + Zan × Dalat.app",
      description: locale === "fr" ? "Un atelier de collaboration" : locale === "vi" ? "Buổi trao đổi về hợp tác" : "A collaboration workshop",
      images: [],
    },
    twitter: { card: "summary", title: "Phương + Zan × Dalat.app", images: [] },
  };
}

export default async function PhươngPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("phuong");
  // Route-specific server dictionary: do not add meeting copy to the global client shell.
  const copy = t.raw("canvas") as WorkshopCopy;
  return <><div className="p-4 text-center text-sm border-b"><a href={`https://phuong.dalat.app${locale === "en" ? "/" : `/${locale}`}`}>{locale === "vi" ? "← Thử nghiệm hiện tại · V2" : locale === "fr" ? "← L’expérience actuelle · V2" : "← Current experiment · V2"}</a></div><Workshop copy={copy} language={locale === "vi" || locale === "fr" ? locale : "en"} /></>;
}
