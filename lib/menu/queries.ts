import { createClient, createStaticClient } from "@/lib/supabase/server";
import { pickLocalized } from "./format";
import type { MenuSection, MenuSectionRow, MenuItemRow } from "./types";

const ITEM_COLS =
  "id,section_id,name,name_i18n,description,description_i18n,price_vnd,tags,image_url,is_available,is_sold_out,sort";
const SECTION_COLS = "id,slug,title,title_i18n,note,note_i18n,sort,is_visible";

type SectionWithItems = Omit<MenuSectionRow, "items"> & { venue_menu_items: MenuItemRow[] | null };

/** Public, localized menu. Uses the static client so it works inside ISR/unstable_cache. */
export async function getPublicMenu(venueId: string, locale: string): Promise<MenuSection[]> {
  const db = createStaticClient();
  if (!db) return [];
  const { data, error } = await db
    .from("venue_menu_sections")
    .select(`${SECTION_COLS}, venue_menu_items(${ITEM_COLS})`)
    .eq("venue_id", venueId)
    .eq("is_visible", true)
    .order("sort", { ascending: true });
  if (error) {
    console.error("getPublicMenu failed", error);
    return [];
  }
  return ((data ?? []) as unknown as SectionWithItems[])
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      title: pickLocalized(s.title_i18n, locale, s.title),
      note: pickLocalized(s.note_i18n, locale, s.note),
      items: (s.venue_menu_items ?? [])
        .filter((i) => i.is_available)
        .sort((a, b) => a.sort - b.sort)
        .map((i) => ({
          id: i.id,
          name: pickLocalized(i.name_i18n, locale, i.name),
          description: pickLocalized(i.description_i18n, locale, i.description),
          price_vnd: i.price_vnd,
          tags: i.tags ?? [],
          image_url: i.image_url,
          is_sold_out: i.is_sold_out,
        })),
    }))
    .filter((s) => s.items.length > 0);
}

/** Everything, including hidden/unavailable rows — for the manager UI (RLS gates it). */
export async function getMenuForEditing(venueId: string): Promise<MenuSectionRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("venue_menu_sections")
    .select(`${SECTION_COLS}, venue_menu_items(${ITEM_COLS})`)
    .eq("venue_id", venueId)
    .order("sort", { ascending: true });
  // An empty editor would invite owners to rebuild a menu that still exists.
  if (error) throw new Error(`Loading menu for editing failed: ${error.message}`);
  return ((data ?? []) as unknown as SectionWithItems[]).map(({ venue_menu_items, ...s }) => ({
    ...s,
    items: (venue_menu_items ?? []).sort((a, b) => a.sort - b.sort),
  }));
}
