import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import {
  MomentsDiscoveryDesktop,
  MomentsDiscoveryMobile,
} from "@/components/moments/moments-discovery";
import { generateMomentsDiscoveryMetadata } from "@/lib/metadata";
import { JsonLd, generateBreadcrumbSchema, generateMomentsDiscoverySchema } from "@/lib/structured-data";
import type { Locale } from "@/lib/i18n/routing";
import type { MomentWithEvent, DiscoveryEventMomentsGroup } from "@/lib/types";

const INITIAL_PAGE_SIZE = 12;
const INITIAL_EVENTS = 5;
const MOMENTS_PER_EVENT = 6;

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

// Flat moments for mobile TikTok-style feed
async function getMoments(): Promise<MomentWithEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed_moments", {
    p_limit: INITIAL_PAGE_SIZE,
    p_offset: 0,
    p_content_types: ["photo", "video"],
  });

  if (error) {
    console.error("Failed to fetch moments:", error);
    return [];
  }

  return (data ?? []) as MomentWithEvent[];
}

// Grouped moments for desktop discovery feed
async function getMomentsGrouped(): Promise<{
  groups: DiscoveryEventMomentsGroup[];
  hasMore: boolean;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed_moments_grouped", {
    p_event_limit: INITIAL_EVENTS,
    p_moments_per_event: MOMENTS_PER_EVENT,
    p_event_offset: 0,
    p_content_types: ["photo", "video"],
  });

  if (error) {
    console.error("Failed to fetch grouped moments:", error);
    return { groups: [], hasMore: false };
  }

  const groups = (data ?? []) as DiscoveryEventMomentsGroup[];
  return {
    groups,
    hasMore: groups.length >= INITIAL_EVENTS,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "moments" });
  return generateMomentsDiscoveryMetadata(
    locale,
    t("moments"),
    t("discoveryDescription")
  );
}

export default async function MomentsDiscoveryPage({ params }: PageProps) {
  const { locale } = await params;

  // Fetch both flat (mobile) and grouped (desktop) data in parallel
  const [moments, groupedData, t] = await Promise.all([
    getMoments(),
    getMomentsGrouped(),
    getTranslations({ locale, namespace: "moments" }),
  ]);

  const mobileHasMore = moments.length === INITIAL_PAGE_SIZE;

  const discoverySchema = generateMomentsDiscoverySchema(moments, locale);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: t("moments"), url: "/moments" },
    ],
    locale
  );

  return (
    <>
      <JsonLd data={[discoverySchema, breadcrumbSchema]} />
      {/* Mobile: TikTok-style immersive feed with floating filter bar */}
      <div className="lg:hidden">
        <MomentsDiscoveryMobile
          initialMoments={moments}
          initialHasMore={mobileHasMore}
        />
      </div>

      {/* Desktop: Event-grouped feed */}
      <main className="hidden lg:flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1 container max-w-5xl mx-auto px-4 py-8">
          <MomentsDiscoveryDesktop
            initialGroups={groupedData.groups}
            initialHasMore={groupedData.hasMore}
          />
        </div>
      </main>
    </>
  );
}
