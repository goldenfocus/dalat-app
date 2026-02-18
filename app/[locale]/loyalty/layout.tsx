import { ArrowLeft } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { locales } from "@/lib/i18n/routing";

type LayoutProps = {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LoyaltyLayout({ params, children }: LayoutProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");

  return (
    <div className="min-h-screen pb-20">
      <div className="container max-w-4xl mx-auto px-4 py-4">
        <nav className="mb-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("back")}</span>
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
