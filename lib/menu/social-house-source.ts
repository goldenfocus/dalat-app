import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuOptionGroup } from "./types";

export const SOCIAL_HOUSE_MENU_SOURCE = "https://socialhousedalat.com/menu/";
const sectionAliases: Record<string, string> = {
  "Socialhouse Burrito": "burritos", "Vietnamese Coffee": "coffee", "Italian Coffee - Moka Pot": "moka-pot",
  "French Toast and Pancakes": "pancakes-french-toast", "Chocolate Signature": "chocolate", "Caffeine-free": "non-caffeine",
};
const itemAliases: Record<string, string> = {
  "Chicken and Egg Burrito": "Chicken Burrito", "Vegetarian Burrito": "Vegetable Burrito",
  "Signature French Toast": "French toast", "Fresh-made Pancakes": "Pancakes with homemade jam",
  "Matcha Coconut Cloud": "Coconut Matcha Cloud", "Matcha Strawberry Cloud": "Strawberry Matcha",
  "Signature Hot Chocolate": "Hot Chocolate", 'Hot Chocolate with "heaven" whipped cream': "Hot Chocolate with “heaven” whipped cream",
  "Special Hot Tea Pot": "Hot Tea Pot", "Homemade Cookies": "Cookies", "Homemade Chocolate Brownie": "Chocolate Brownie",
};
const slug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function parseSocialHouseMenu(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = scripts.flatMap(match => { const value = JSON.parse(match[1]); return Array.isArray(value) ? value : [value]; });
  const menu = nodes.map(object).find(node => node["@type"] === "Menu" && node.url === SOCIAL_HOUSE_MENU_SOURCE);
  if (!menu || !Array.isArray(menu.hasMenuSection)) throw new Error("Official menu structure is missing");
  const keys = new Set<string>();
  const sections = menu.hasMenuSection.map((raw, sort) => {
    const section = object(raw), title = text(section.name);
    if (!title) throw new Error("Official menu section is unnamed");
    const sectionSlug = sectionAliases[title] || slug(title);
    const items = (Array.isArray(section.hasMenuItem) ? section.hasMenuItem : []).map(rawItem => {
      const item = object(rawItem), offers = object(item.offers), sourceName = text(item.name);
      const name = sourceName.replace(/\s*\([^)]*\)$/, "");
      const price = Number(offers.price);
      if (!name || offers.priceCurrency !== "VND" || !Number.isInteger(price) || price < 1000 || price > 10000000) throw new Error("Official menu price is invalid");
      const key = `${sectionSlug}/${slug(name)}`;
      if (keys.has(key)) throw new Error("Official menu item is duplicated");
      keys.add(key);
      const option_groups: MenuOptionGroup[] = [];
      if (/hot\s*\/\s*iced/i.test(sourceName)) option_groups.push({ id: "temperature", choices: [{ id: "hot", price_vnd: 0 }, { id: "iced", price_vnd: 0 }] });
      if (["coffee", "moka-pot"].includes(sectionSlug) && /Wine-fermented Robusta \+10,000/.test(text(section.description))) option_groups.push({ id: "beans", default: "house", choices: [{ id: "house", price_vnd: 0 }, { id: "wineRobusta", price_vnd: 10000 }] });
      if (/chocolate\s*\/\s*matcha chocolate/i.test(sourceName)) option_groups.push({ id: "flavour", choices: [{ id: "chocolate", price_vnd: 0 }, { id: "matchaChocolate", price_vnd: 0 }] });
      return { key, name, previousName: itemAliases[name] || name, description: text(item.description) || null, price, option_groups,
        tags: [...(item.suitableForDiet === "https://schema.org/VegetarianDiet" ? ["vegetarian"] : []), ...(/hot/i.test(sourceName) ? ["hot"] : []), ...(/iced/i.test(sourceName) ? ["iced"] : [])] };
    });
    return { slug: sectionSlug, title, note: text(section.description) || null, sort, items };
  });
  if (keys.size < 35 || keys.size > 100) throw new Error("Official menu item count changed unexpectedly");
  return sections;
}

export async function syncSocialHouseMenu(db: SupabaseClient, html?: string) {
  if (!html) {
    const response = await fetch(SOCIAL_HOUSE_MENU_SOURCE, { signal: AbortSignal.timeout(15000), cache: "no-store", redirect: "error" });
    if (!response.ok) throw new Error(`Official menu fetch failed: ${response.status}`);
    html = await response.text();
    if (html.length > 500000) throw new Error("Official menu is too large");
  }
  const sections = parseSocialHouseMenu(html);
  const { data: venue, error: venueError } = await db.from("venues").select("id").eq("slug", "social-house-dalat").single();
  if (venueError || !venue) throw new Error("Social House venue is unavailable");
  const { data, error } = await db.rpc("sync_official_venue_menu", { p_venue_id: venue.id, p_sections: sections });
  if (error) throw new Error(`Official menu sync failed: ${error.code}`);
  return data;
}
