import { ArrowLeft } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { DeferredLocalePicker } from "@/components/site-header-deferred";
import { Link } from "@/lib/i18n/routing";
import "./rentals.css";

export default async function RentalsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [t, messages] = await Promise.all([getTranslations("common"), getMessages()]);
  const rentalsMessages = Object.fromEntries(["common", "rentalsDetails", "rentalsPilot", "translations"]
    .map(key => [key, messages[key]]));

  return (
    <NextIntlClientProvider messages={rentalsMessages}>
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
    </NextIntlClientProvider>
  );
}
