import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { TribeHeader } from "@/components/tribes/tribe-header";
import { TribeMembersList } from "@/components/tribes/tribe-members-list";
import { TribeEventsList } from "@/components/tribes/tribe-events-list";
import { JoinTribeButton } from "@/components/tribes/join-tribe-button";

interface PageProps { params: Promise<{ slug: string; locale: string }>; }

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: tribe } = await supabase.from("tribes").select("name, description, cover_image_url").eq("slug", slug).single();
  if (!tribe) return { title: "Tribe not found" };
  return {
    title: `${tribe.name} | ĐàLạt.app`,
    description: tribe.description,
    openGraph: { title: tribe.name, description: tribe.description || undefined, images: tribe.cover_image_url ? [tribe.cover_image_url] : undefined },
  };
}

export default async function TribePage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const t = await getTranslations("tribes");
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tribe } = await supabase.from("tribes").select(`*, profiles:created_by(id, display_name, avatar_url, username), tribe_members(count)`).eq("slug", slug).single();
  if (!tribe) notFound();

  let membership = null;
  let pendingRequest = null;

  if (user) {
    const { data: mem } = await supabase.from("tribe_members").select("*").eq("tribe_id", tribe.id).eq("user_id", user.id).single();
    membership = mem;
    if (!membership) {
      const { data: req } = await supabase.from("tribe_requests").select("*").eq("tribe_id", tribe.id).eq("user_id", user.id).eq("status", "pending").single();
      pendingRequest = req;
    }
  }

  if (tribe.access_type === "secret" && !membership) notFound();

  const isAdmin = membership?.role === "leader" || membership?.role === "admin" || tribe.created_by === user?.id;

  const eventsQuery = supabase.from("events").select("*, profiles:created_by(display_name, avatar_url)").eq("tribe_id", tribe.id).eq("status", "published").order("starts_at", { ascending: true });
  if (!membership) eventsQuery.eq("tribe_visibility", "public");
  const { data: events } = await eventsQuery;

  return (
    <main className="min-h-screen">
      <TribeHeader tribe={tribe} membership={membership} isAdmin={isAdmin} />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {!membership && <JoinTribeButton tribe={tribe} pendingRequest={pendingRequest} isAuthenticated={!!user} />}
        <section>
          <h2 className="text-lg font-semibold mb-4">{t("events")}</h2>
          <TribeEventsList events={events || []} locale={locale} />
        </section>
        {membership && (
          <section>
            <h2 className="text-lg font-semibold mb-4">{t("members")}</h2>
            <TribeMembersList tribeSlug={slug} isAdmin={isAdmin} />
          </section>
        )}
      </div>
    </main>
  );
}
