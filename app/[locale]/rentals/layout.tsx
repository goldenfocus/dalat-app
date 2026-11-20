import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { DeferredLocalePicker } from "@/components/site-header-deferred";
import { Link } from "@/lib/i18n/routing";
import "./rentals.css";

export default function RentalsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslations("common");

  return (
    <div data-rentals-page>
      <header className="border-b bg-card">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-8">
          <Link href="/" prefetch={false} aria-label={`${t("back")} · ĐàLạt.app`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary sm:text-base">
            <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            ĐàLạt.app
          </Link>
          <DeferredLocalePicker />
        </div>
      </header>
      {children}
    </div>
  );
}
