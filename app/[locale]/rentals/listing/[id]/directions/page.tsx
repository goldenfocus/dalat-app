import { RentalLocaleLink } from "@/components/rentals/locale-link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildAlternates } from "@/lib/metadata";
import { type Locale } from "@/lib/i18n/routing";
import { rentalDirectionsColumns, type RentalDirections } from "@/lib/rentals/directions";
import { saveRentalDirections } from "./actions";
import { ownerRentalDirections } from "./owner";

type Props = { params: Promise<{ id: string; locale: Locale }>; searchParams: Promise<{ error?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "rentalsPilot" });
  return { title: t("directions"), alternates: buildAlternates(locale, `/rentals/listing/${id}/directions`), robots: { index: false, follow: false }, openGraph: null, twitter: null };
}

export default async function RentalDirectionsEditor({ params, searchParams }: Props) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const [{ db, listing }, feedback, t, common] = await Promise.all([
    ownerRentalDirections(id), searchParams, getTranslations({ locale, namespace: "rentalsPilot" }), getTranslations({ locale, namespace: "common" }),
  ]);
  const saved = await db.from("rental_directions").select(rentalDirectionsColumns).eq("listing_id", id).maybeSingle();
  const values = saved.data as RentalDirections | null;
  const input = "mt-1 min-h-11 w-full rounded-lg border bg-background px-3 py-2";
  return <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-6">
    <RentalLocaleLink locale={locale} href={`/rentals/listing/${id}`} className="inline-flex min-h-11 items-center text-sm underline">{common("back")}</RentalLocaleLink>
    <h1 data-rentals-title className="text-4xl">{t("directions")}</h1>
    <p className="break-words text-muted-foreground">{listing.title}</p>
    {(saved.error || feedback.error) && <p role="alert" className="rounded-lg border p-3">
      {t(feedback.error === "links" ? "directionsInvalid" : "failed")}
    </p>}
    {!saved.error && <form action={saveRentalDirections.bind(null, id)} className="space-y-4">
      <label className="block">{t("viewingAddress")}<input name="address" maxLength={250} defaultValue={values?.address} className={input} /></label>
      <label className="block">{t("mapsInput")}<input name="maps_url" maxLength={2048} defaultValue={values?.maps_url} className={input} /></label>
      <label className="block">{t("grabInput")}<input type="url" name="grab_url" maxLength={2048} defaultValue={values?.grab_url} className={input} /></label>
      <fieldset>
        <legend className="font-medium">{t("directionsVisibility")}</legend>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="visibility" value="confirmed" defaultChecked={!values?.is_public} />{t("directionsConfirmed")}</label>
        <label className="flex min-h-11 items-center gap-2"><input type="radio" name="visibility" value="public" defaultChecked={values?.is_public} />{t("directionsPublic")}</label>
      </fieldset>
      <button className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground">{common("save")}</button>
    </form>}
  </main>;
}
