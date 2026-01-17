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
import type { MomentLikeStatus, MomentWithEvent } from "@/lib/types";

const INITIAL_PAGE_SIZE = 12;

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

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

async function getMomentLikes(momentIds: string[]): Promise<MomentLikeStatus[]> {
  if (momentIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_moment_like_counts", {
    p_moment_ids: momentIds,
  });

  if (error) {
    console.error("Failed to fetch like counts:", error);
    return [];
  }

  return (data ?? []) as MomentLikeStatus[];
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
  const moments = await getMoments();
  const likeStatuses = await getMomentLikes(moments.map((m) => m.id));
  const hasMore = moments.length === INITIAL_PAGE_SIZE;
  const t = await getTranslations({ locale, namespace: "moments" });

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
      <div className="lg:hidden">
        <MomentsDiscoveryMobile
          initialMoments={moments}
          initialLikes={likeStatuses}
          initialHasMore={hasMore}
        />
      </div>

      <main className="hidden lg:flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1 container max-w-5xl mx-auto px-4 py-8">
          <MomentsDiscoveryDesktop
            initialMoments={moments}
            initialLikes={likeStatuses}
            initialHasMore={hasMore}
          />
        </div>
      </main>
    </>
  );
}
