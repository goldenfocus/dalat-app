import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/server";
import type { Tribe } from "@/lib/types";

export type DiscoverTribe = Pick<
  Tribe,
  "id" | "slug" | "name" | "description" | "cover_image_url" | "access_type" | "settings"
>;

/**
 * Listed public/request tribes for discovery surfaces (/tribes + homepage strip).
 * ISR-cached; uses createStaticClient because unstable_cache has no request
 * context. Returns [] on any failure — callers render an empty state / nothing
 * instead of erroring.
 */
export const getDiscoverTribes = unstable_cache(
  async (): Promise<DiscoverTribe[]> => {
    const supabase = createStaticClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("tribes")
      .select("id, slug, name, description, cover_image_url, access_type, settings")
      .in("access_type", ["public", "request"])
      .eq("is_listed", true)
      .order("created_at", { ascending: true })
      .limit(60);

    if (error) {
      console.error("Error fetching discover tribes:", error);
      return [];
    }
    return (data ?? []) as DiscoverTribe[];
  },
  ["discover-tribes"],
  { revalidate: 300 }
);
