"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSelectedLayoutSegment } from "next/navigation";
import { AuthButtonClient } from "@/components/auth-button-client";
import { DeferredLocalePicker } from "@/components/site-header-deferred";
import type { Locale } from "@/lib/i18n/routing";
import { RentalLocaleLink } from "./locale-link";

export function RentalsHeader({ locale }: { locale: Locale }) {
  const section = useSelectedLayoutSegment();
  const t = useTranslations("rentalsPilot");

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-8">
        <RentalLocaleLink locale={locale} href={section ? "/rentals" : "/"} prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-primary sm:text-base">
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          {section ? t("title") : "ĐàLạt.app"}
        </RentalLocaleLink>
        <div className="flex items-center gap-1">
          <DeferredLocalePicker />
          <AuthButtonClient showNotifications={false} />
        </div>
      </div>
    </header>
  );
}
