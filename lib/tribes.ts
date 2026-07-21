import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/server";
import type { Tribe } from "@/lib/types";

export type DiscoverTribe = Pick<
  Tribe,
  "id" | "slug" | "name" | "description" | "cover_image_url" | "access_type" | "settings"
>;

const GRADIENTS = [
  "from-orange-400 to-rose-500",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-purple-400 to-fuchsia-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-purple-500",
];

/** Deterministic fallback gradient for a tribe with no cover or avatar. */
export function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

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
