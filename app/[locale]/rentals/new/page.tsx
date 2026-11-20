import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, type Locale } from "@/lib/i18n/routing";
import { buildAlternates } from "@/lib/metadata";
import { createClient } from "@/lib/supabase/server";
import { rentalColumns, rentalId, type RentalListing } from "@/lib/rentals/data";
import { RentalOfferEditor } from "@/components/rentals/offer-editor";
import { RentalVideoEditor } from "@/components/rentals/video-editor";
import { RentalPhotoEditor } from "@/components/rentals/photo-editor";
import { RentalDetailsEditor } from "@/components/rentals/details-editor";
import { rentalDetails } from "@/lib/rentals/details";
import { saveRental } from "../actions";

type Props = { params: Promise<{ locale: Locale }>; searchParams: Promise<{ id?: string; error?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("addRental"), alternates: buildAlternates(locale, "/rentals/new"), robots: { index: false, follow: false } };
}
export default async function NewRental({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { id, error } = await searchParams;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    const next = (locale === "en" ? "" : "/" + locale) + "/rentals/new" + (id ? "?id=" + encodeURIComponent(id) : "");
    return redirect({ href: "/auth/login?next=" + encodeURIComponent(next), locale });
  }
  let listing: RentalListing | null = null;
  if (id) {
    if (!rentalId.safeParse(id).success) notFound();
    const found = await db.from("rental_listings").select(rentalColumns).eq("host_id", user.id).eq("id", id).maybeSingle();
    if (!found.data) notFound();
    listing = found.data as RentalListing;
  }
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  const common = await getTranslations({ locale, namespace: "common" });
  const input = "mt-1 w-full rounded-lg border bg-background px-3 py-2";
  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5 px-4 py-6">
      <RentalLocaleLink locale={locale} href="/rentals" className="text-sm underline">{common("back")}</RentalLocaleLink>
      <h1 data-rentals-title className="text-4xl">{listing ? common("edit") : common("addRental")}</h1>
      {error && <p role="alert" className="rounded-lg border border-destructive p-3">{t("failed")}</p>}
      <form action={saveRental} className="space-y-4">
        {listing && <input type="hidden" name="id" value={listing.id} />}
        <input type="hidden" name="source_locale" value={listing?.source_locale || locale} />
        <label className="block">{common("title")}<input name="title" required maxLength={120} className={input} defaultValue={listing?.title} /></label>
        <label className="block">{common("description")}<textarea name="description" rows={4} maxLength={8000} className={input} defaultValue={listing?.description} /></label>
        <RentalOfferEditor initial={listing} />
        <RentalDetailsEditor details={rentalDetails(listing?.details)} />
        <RentalVideoEditor initial={listing?.videos ?? []} />
        <RentalPhotoEditor initial={listing?.photos || []} labels={{
          photos: t("photos"), upload: common("upload"), remove: common("remove"),
          previous: common("previousPhoto"), next: common("nextPhoto"), loading: common("loading"),
          failed: t("failed"), viewPhoto: t("viewPhoto", { number: "{number}" }),
        }} />
        <div className="flex flex-wrap gap-2">
          <button name="status" value="draft" className="rounded-lg border px-4 py-2">{t("draft")}</button>
          <button name="status" value="published" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{t("publish")}</button>
        </div>
      </form>
    </div>
  );
}
