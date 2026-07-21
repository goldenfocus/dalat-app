import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { TribeHeader } from "@/components/tribes/tribe-header";
import { TribeMembersList } from "@/components/tribes/tribe-members-list";
import { TribeEventsList } from "@/components/tribes/tribe-events-list";
import { JoinTribeButton } from "@/components/tribes/join-tribe-button";
import { TribeTabs } from "@/components/tribes/tribe-tabs";
import { MomentsTimeline } from "@/components/moments/moments-timeline";
import type { EventMomentsGroup } from "@/lib/types";
import { generateLocalizedMetadata } from "@/lib/metadata";
import type { Locale } from "@/lib/i18n/routing";

// Keep in sync with the same constants in components/moments/moments-timeline.tsx,
// which paginates from this initial page.
const EVENTS_PER_PAGE = 5;
const MOMENTS_PER_EVENT = 6;

interface PageProps { params: Promise<{ slug: string; locale: string }>; }

export async function generateMetadata({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = createStaticClient();
  if (!supabase) return { title: "Tribe" };
  const { data: tribe } = await supabase.from("tribes").select("name, description, cover_image_url, access_type, is_listed").eq("slug", slug).single();
  if (!tribe) return { title: "Tribe not found" };

  // Same discoverability gate as the browse filter: only public/request +
  // listed tribes should be indexed; the rest stay reachable but noindex.
  const isDiscoverable =
    (tribe.access_type === "public" || tribe.access_type === "request") && tribe.is_listed;

  const metadata = generateLocalizedMetadata({
    locale: locale as Locale,
    path: `/tribes/${slug}`,
    title: tribe.name,
    description: tribe.description || `${tribe.name} — a community on ĐàLạt.app in Đà Lạt, Vietnam`,
    image: tribe.cover_image_url || undefined,
    keywords: [tribe.name, "tribe", "community", "Đà Lạt"],
  });

  if (!isDiscoverable) {
    metadata.robots = { index: false, follow: false };
  }

  return metadata;
}

export default async function TribePage({ params }: PageProps) {
  const { slug, locale } = await params;
  const supabase = await createClient();
  const t = await getTranslations("tribes");
  const { data: { user } } = await supabase.auth.getUser();

  // NOTE: member count comes from tribes.member_count (trigger-maintained), not
  // a tribe_members(count) aggregate. RLS is applied before aggregation, so the
  // aggregate silently returned 0 for anyone who wasn't already a member.
  const { data: tribe } = await supabase.from("tribes").select(`*, profiles:created_by(id, display_name, avatar_url, username)`).eq("slug", slug).single();
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

  // invite_code grants membership on its own — /api/tribes/[slug]/membership
  // inserts the row for any valid code, with no approval step. RLS makes
  // invite_only tribes readable by anonymous visitors, so passing the whole row
  // to a client component published the code in the RSC payload to everyone who
  // could load the page. Strip it for non-admins before it crosses that boundary.
  const clientTribe = isAdmin ? tribe : { ...tribe, invite_code: null };

  // Mirrors the browse filter in app/api/tribes/route.ts and the gate inside
  // get_tribe_public_members(): only already-discoverable tribes expose a roster.
  const isDiscoverable =
    (tribe.access_type === "public" || tribe.access_type === "request") && tribe.is_listed;

  const eventsQuery = supabase.from("events").select("*, profiles:created_by(display_name, avatar_url)").eq("tribe_id", tribe.id).eq("status", "published").order("starts_at", { ascending: true });
  if (!membership) eventsQuery.eq("tribe_visibility", "public");

  // Both RPCs gate on tribe/event visibility internally via auth.uid(), so this
  // request-scoped client (not createStaticClient) is required for members to
  // see members_only galleries.
  const [{ data: events }, { data: momentGroups }, { data: momentCount }] = await Promise.all([
    eventsQuery,
    supabase.rpc("get_tribe_moments_grouped", {
      p_tribe_id: tribe.id,
      p_event_limit: EVENTS_PER_PAGE,
      p_moments_per_event: MOMENTS_PER_EVENT,
      p_event_offset: 0,
      p_content_types: ["photo", "video", "text"],
    }),
    supabase.rpc("get_tribe_moment_count", { p_tribe_id: tribe.id }),
  ]);

  const groups = (momentGroups ?? []) as EventMomentsGroup[];

  return (
    <main className="min-h-screen">
      <TribeHeader
        tribe={clientTribe}
        membership={membership}
        isAdmin={isAdmin}
        eventCount={events?.length ?? 0}
        momentCount={momentCount ?? 0}
      />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!membership && <JoinTribeButton tribe={clientTribe} pendingRequest={pendingRequest} isAuthenticated={!!user} />}
        <TribeTabs
          // Omitting the slot hides the tab entirely, so a tribe with no gallery
          // keeps the original events-first page instead of showing an empty grid.
          momentsSlot={groups.length > 0 ? (
            <MomentsTimeline
              source={{ type: "tribe", tribeId: tribe.id }}
              initialGroups={groups}
              initialHasMore={groups.length >= EVENTS_PER_PAGE}
              showHeading={false}
            />
          ) : undefined}
          eventsSlot={
            <section className="space-y-4">
              {isAdmin && (
                <div className="flex justify-end">
                  <Link href={`/events/new?tribe=${tribe.slug}`}>
                    <Button variant="outline" size="sm" className="gap-2 px-3 py-2 active:scale-95 transition-all">
                      <Plus className="w-4 h-4" />
                      {t("createEvent")}
                    </Button>
                  </Link>
                </div>
              )}
              <TribeEventsList events={events || []} locale={locale} />
            </section>
          }
          // Discoverable tribes show their roster to everyone — seeing who runs
          // a tribe and who's in it is the whole reason to join one. invite_only
          // and secret tribes stay members-only.
          membersSlot={(membership || isDiscoverable) ? <TribeMembersList tribeSlug={slug} isAdmin={isAdmin} /> : undefined}
        />
      </div>
    </main>
  );
}
