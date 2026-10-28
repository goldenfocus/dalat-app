import { translatedRecords } from "@/lib/translations/public-content";
import { createClient, createStaticClient } from "@/lib/supabase/server";
import { pickLocalized, currentOverrides } from "./format";
import type { MenuSection, MenuSectionRow, MenuItemRow } from "./types";

const ITEM_COLS =
  "id,section_id,name,name_i18n,name_i18n_sources,description,description_i18n,description_i18n_sources,price_vnd,tags,image_url,is_available,is_sold_out,sort";
const SECTION_COLS =
  "id,slug,title,title_i18n,title_i18n_sources,note,note_i18n,note_i18n_sources,sort,is_visible";

type SectionWithItems = Omit<MenuSectionRow, "items"> & {
  venue_menu_items: MenuItemRow[] | null;
};

/** Public, localized menu. Uses the static client so it works inside ISR/unstable_cache. */
export async function getPublicMenu(
  venueId: string,
  locale: string,
): Promise<MenuSection[]> {
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
  const sections = (data ?? []) as unknown as SectionWithItems[];
  const [sectionTranslations, itemTranslations] = await Promise.all([
    translatedRecords(
      "menu_section",
      sections.map((s) => s.id),
      locale,
    ),
    translatedRecords(
      "menu_item",
      sections.flatMap((s) => (s.venue_menu_items || []).map((i) => i.id)),
      locale,
    ),
  ]);
  return sections
    .map((s) => {
      const translated = sectionTranslations.get(s.id);
      return {
        id: s.id,
        slug: s.slug,
        title: pickLocalized(
          currentOverrides(s.title_i18n, s.title, s.title_i18n_sources),
          locale,
          translated?.get("title") || s.title,
        ),
        note: pickLocalized(
          currentOverrides(s.note_i18n, s.note, s.note_i18n_sources),
          locale,
          translated?.get("note") || s.note,
        ),
        originalTitle: s.title,
        originalNote: s.note,
        items: (s.venue_menu_items || [])
          .filter((i) => i.is_available)
          .sort((a, b) => a.sort - b.sort)
          .map((i) => {
            const translated = itemTranslations.get(i.id);
            return {
              id: i.id,
              name: pickLocalized(
                currentOverrides(i.name_i18n, i.name, i.name_i18n_sources),
                locale,
                translated?.get("name") || i.name,
              ),
              description: pickLocalized(
                currentOverrides(
                  i.description_i18n,
                  i.description,
                  i.description_i18n_sources,
                ),
                locale,
                translated?.get("description") || i.description,
              ),
              originalName: i.name,
              originalDescription: i.description,
              price_vnd: i.price_vnd,
              tags: i.tags || [],
              image_url: i.image_url,
              is_sold_out: i.is_sold_out,
            };
          }),
      };
    })
    .filter((s) => s.items.length > 0);
}

/** Everything, including hidden/unavailable rows — for the manager UI (RLS gates it). */
export async function getMenuForEditing(
  venueId: string,
): Promise<MenuSectionRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("venue_menu_sections")
    .select(`${SECTION_COLS}, venue_menu_items(${ITEM_COLS})`)
    .eq("venue_id", venueId)
    .order("sort", { ascending: true });
  // An empty editor would invite owners to rebuild a menu that still exists.
  if (error)
    throw new Error(`Loading menu for editing failed: ${error.message}`);
  return ((data ?? []) as unknown as SectionWithItems[]).map(
    ({ venue_menu_items, ...s }) => ({
      ...s,
      items: (venue_menu_items ?? []).sort((a, b) => a.sort - b.sort),
    }),
  );
}
