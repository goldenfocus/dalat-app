import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { VenueClaimReview } from "@/components/venues/claims/claim-review";

export const dynamic = "force-dynamic";

export default async function VenueClaimsAdminPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/auth/login");
  const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "superadmin"].includes(me?.role || "")) redirect("/admin");
  const t = await getTranslations("venueClaim");
  const { data: claims } = await db
    .from("venue_claims")
    .select("id,created_at,contact_email,contact_phone,note,venue:venues(slug,name,address),claimant:profiles!venue_claims_user_id_fkey(username,display_name)")
    .eq("status", "pending")
    .order("created_at");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("queueTitle")}</h1>
      {!claims?.length && <p className="text-muted-foreground">{t("queueEmpty")}</p>}
      {(claims || []).map((c) => {
        const venue = c.venue as unknown as { slug: string; name: string; address: string | null } | null;
        const who = c.claimant as unknown as { username: string | null; display_name: string | null } | null;
        return (
          <div key={c.id} className="space-y-2 rounded-xl border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/${venue?.slug}`} className="font-semibold underline">{venue?.name}</Link>
              <span className="text-xs text-muted-foreground">{c.created_at.slice(0, 10)}</span>
            </div>
            <p className="text-sm">
              {who?.display_name || who?.username}
              {who?.username && <Link className="ml-1 text-muted-foreground underline" href={`/${who.username}`}>@{who.username}</Link>}
            </p>
            <ul className="text-sm text-muted-foreground">
              {c.contact_email && <li>✉️ {c.contact_email}</li>}
              {c.contact_phone && <li>📞 {c.contact_phone}</li>}
              {c.note && <li className="whitespace-pre-wrap">📝 {c.note}</li>}
            </ul>
            <VenueClaimReview claimId={c.id} />
          </div>
        );
      })}
    </div>
  );
}
