import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { VenueClaimForm } from "@/components/venues/claims/claim-form";

type Props = { params: Promise<{ locale: string; slug: string }> };
export const metadata: Metadata = { robots: { index: false } };

export default async function ClaimVenuePage({ params }: Props) {
  const { slug, locale } = await params;
  const db = await createClient();
  const { data: venue } = await db.from("venues").select("id,slug,name,address,owner_id").eq("slug", slug).maybeSingle();
  if (!venue) notFound();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login?next=${encodeURIComponent(`/${locale}/venues/${slug}/claim`)}`);
  const t = await getTranslations("venueClaim");
  const { data: pending } = await db.from("venue_claims").select("id").eq("venue_id", venue.id).eq("user_id", user.id).eq("status", "pending").maybeSingle();
  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <Link href={`/${venue.slug}`} className="text-sm text-muted-foreground">← {venue.name}</Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("title", { name: venue.name })}</h1>
        {venue.address && <p className="text-sm text-muted-foreground">{venue.address}</p>}
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      {venue.owner_id ? (
        <p className="rounded-2xl bg-muted p-5">{venue.owner_id === user.id ? t("youOwn") : t("alreadyClaimed")}</p>
      ) : pending ? (
        <p className="rounded-2xl bg-muted p-5">{t("alreadyPending")}</p>
      ) : (
        <VenueClaimForm venueId={venue.id} />
      )}
    </main>
  );
}
