import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MomentsFeed } from "@/components/feed";
import type { MomentWithEvent } from "@/lib/types";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

const INITIAL_PAGE_SIZE = 10;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl = `${SITE_URL}/${locale}/moments`;
  const pageUrl = `${SITE_URL}/${locale}/feed`;

  return {
    title: `Feed | ${SITE_NAME}`,
    description: "Discover moments from past events in Đà Lạt",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `Feed | ${SITE_NAME}`,
      description: "Discover moments from past events in Đà Lạt",
      type: "website",
      url: pageUrl,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

async function getFeedMoments(): Promise<MomentWithEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_feed_moments", {
    p_limit: INITIAL_PAGE_SIZE,
    p_offset: 0,
    p_content_types: ["photo", "video"],
  });

  if (error) {
    console.error("Failed to fetch feed moments:", error);
    return [];
  }

  return (data ?? []) as MomentWithEvent[];
}

export default async function FeedPage() {
  const moments = await getFeedMoments();
  const hasMore = moments.length === INITIAL_PAGE_SIZE;

  return (
    <main className="bg-black min-h-screen">
      <MomentsFeed
        initialMoments={moments}
        hasMore={hasMore}
      />
    </main>
  );
}
