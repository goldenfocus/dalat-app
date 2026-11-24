import { unstable_cache } from "next/cache";
import { createStaticClient } from "@/lib/supabase/server";

export const venueDirectoryColumns =
  "id,slug,name,venue_type,address,latitude,longitude,google_maps_url,is_verified,priority_score";

export const getVenueSearchDirectory = unstable_cache(
  async () => {
    const db = createStaticClient();
    if (!db) return [];

    const pageSize = 250;
    const page = (offset: number) => db.from("venues").select(venueDirectoryColumns)
      .order("id").range(offset, offset + pageSize - 1);
    const { data, error } = await page(0);
    if (error) throw error;
    const venues = data ?? [];

    for (let offset = pageSize; venues.length === offset; offset += pageSize) {
      const { data: next, error: pageError } = await page(offset);
      if (pageError) throw pageError;
      venues.push(...(next ?? []));
    }
    return venues;
  },
  ["public-venue-search-directory"],
  { revalidate: 300 },
);
