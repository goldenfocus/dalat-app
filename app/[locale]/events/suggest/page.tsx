import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SuggestEventForm, type SuggestEventCopy } from "@/components/events/suggest-event-form";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/i18n/routing";
import { generateLocalizedMetadata } from "@/lib/metadata";

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "eventSuggestion" });
  return generateLocalizedMetadata({
    locale,
    path: "/events/suggest",
    title: t("title"),
    description: t("subtitle"),
  });
}

export default async function SuggestEventPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/events/suggest");

  const t = await getTranslations("eventSuggestion");
  const errorKeys = [
    "authentication_required",
    "invalid_request",
    "invalid_url",
    "unsafe_url",
    "source_unavailable",
    "unsupported_source",
    "source_too_large",
    "invalid_flyer",
    "flyer_too_large",
    "storage_unavailable",
    "rate_limit_exceeded",
    "rate_limit_unavailable",
    "review_queue_full",
    "service_unavailable",
    "network",
    "unknown",
  ] as const;
  const errors = Object.fromEntries(
    errorKeys.map((key) => [key, t(`errors.${key}`)])
  ) as Record<string, string>;
  const copy: SuggestEventCopy = {
    urlLabel: t("urlLabel"),
    urlPlaceholder: t("urlPlaceholder"),
    or: t("or"),
    flyerLabel: t("flyerLabel"),
    flyerHint: t("flyerHint"),
    chooseFlyer: t("chooseFlyer"),
    replaceFlyer: t("replaceFlyer"),
    removeFlyer: t("removeFlyer"),
    privacyNote: t("privacyNote"),
    submit: t("submit"),
    submitting: t("submitting"),
    success: t("success"),
    successDelayed: t("successDelayed"),
    duplicate: t("duplicate"),
    suggestAnother: t("suggestAnother"),
    errors,
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <header className="mb-7 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>
        </header>
        <SuggestEventForm copy={copy} />
      </div>
    </main>
  );
}
