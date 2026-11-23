import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { VenueClaimReview } from "@/components/venues/claims/claim-review";

export const dynamic = "force-dynamic";

export default async function VenueClaimsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ organizer?: string }>;
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "superadmin"].includes(me?.role || "")) redirect("/admin");
  const { organizer: legacySlug } = await searchParams;
  const t = await getTranslations("venueClaim");
  const organizers = db.from("organizer_claims")
    .select("id,created_at,contact_email,note,status,entity:organizers!inner(slug,name),claimant:profiles!organizer_claims_user_id_fkey(username,display_name)");
  const [venueResult, organizerResult] = await Promise.all([
    legacySlug ? { data: [], error: null } : db.from("venue_claims")
      .select("id,created_at,contact_email,contact_phone,note,status,entity:venues!inner(slug,name),claimant:profiles!venue_claims_user_id_fkey(username,display_name)")
      .eq("status", "pending"),
    legacySlug
      ? organizers.eq("entity.slug", legacySlug).order("created_at", { ascending: false }).limit(25)
      : organizers.eq("status", "pending"),
  ]);
  if (venueResult.error) throw venueResult.error;
  if (organizerResult.error) throw organizerResult.error;

  const claims = [
    ...(venueResult.data ?? []).map(claim => ({ ...claim, kind: "venue" as const })),
    ...(organizerResult.data ?? []).map(claim => ({ ...claim, kind: "organizer" as const, contact_phone: null })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("queueTitle")}</h1>
      {!claims.length && <p className="text-muted-foreground">{t("queueEmpty")}</p>}
      {claims.map(claim => {
        const entity = claim.entity as unknown as { slug: string; name: string };
        const who = claim.claimant as unknown as { username: string | null; display_name: string | null } | null;
        return (
          <div key={claim.id} id={`claim-${claim.id}`} className="scroll-mt-24 space-y-2 rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/${entity.slug}`} className="font-semibold underline">{entity.name}</Link>
              <span className="text-xs text-muted-foreground">{claim.created_at.slice(0, 10)}</span>
            </div>
            {(who?.display_name || who?.username) && (
              <p className="text-sm">
                {who.display_name}
                {who.username && <Link className="ml-1 text-muted-foreground underline" href={`/${who.username}`}>@{who.username}</Link>}
              </p>
            )}
            <ul className="text-sm text-muted-foreground">
              {claim.contact_email && <li>✉️ {claim.contact_email}</li>}
              {claim.contact_phone && <li>📞 {claim.contact_phone}</li>}
              {claim.note && <li className="whitespace-pre-wrap">📝 {claim.note}</li>}
            </ul>
            {claim.status === "pending"
              ? <VenueClaimReview claimId={claim.id} kind={claim.kind} />
              : <span className="text-sm text-muted-foreground">{t(claim.status === "approved" ? "approved" : "rejected")}</span>}
          </div>
        );
      })}
    </div>
  );
}
