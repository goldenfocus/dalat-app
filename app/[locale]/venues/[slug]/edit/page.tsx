import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { venueEditor } from "@/lib/venues/access";
import { VenueProfileForm } from "@/components/venues/claims/venue-profile-form";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const metadata: Metadata = { robots: { index: false } };

export default async function EditVenueProfilePage({ params }: Props) {
  const { slug, locale } = await params;
  const db = await createClient();
  const { data: venue } = await db
    .from("venues")
    .select("id,slug,name,description,phone,email,website_url,facebook_url,instagram_url,logo_url,operating_hours")
    .eq("slug", slug)
    .maybeSingle();
  if (!venue) notFound();
  const editor = await venueEditor(venue.id);
  if (!editor) redirect(`/${locale}/venues/${slug}/claim`);
  const t = await getTranslations("venueClaim");
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <Link href={`/${venue.slug}`} className="text-sm text-muted-foreground">← {venue.name}</Link>
      <h1 className="text-2xl font-semibold">{t("editTitle", { name: venue.name })}</h1>
      <p className="text-sm text-muted-foreground">{t("photosHint")}</p>
      <VenueProfileForm venue={venue} />
    </main>
  );
}
