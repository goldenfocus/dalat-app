import { localeUrl } from "@/lib/i18n/locale-url";
import type { Locale } from "@/lib/types";
import type { MenuSection } from "./types";

/** Canonical path of a venue's menu page. */
export const venueMenuPath = (slug: string) => `/venues/${slug}/menu`;

/**
 * schema.org Menu → MenuSection → MenuItem(+Offer). Google and AI answer
 * engines read this to answer "how much is a salted cream coffee at X".
 */
export function generateMenuSchema(
  venue: { slug: string; name: string },
  sections: MenuSection[],
  locale: string,
) {
  const url = localeUrl(locale as Locale, venueMenuPath(venue.slug));
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${url}#menu`,
    name: `${venue.name} – Menu`,
    url,
    inLanguage: locale,
    hasMenuSection: sections.map((s) => ({
      "@type": "MenuSection",
      name: s.title,
      ...(s.note && { description: s.note }),
      hasMenuItem: s.items.map((i) => ({
        "@type": "MenuItem",
        name: i.name,
        ...(i.description && { description: i.description }),
        ...(i.image_url && { image: i.image_url }),
        ...(i.tags.includes("vegetarian") && { suitableForDiet: "https://schema.org/VegetarianDiet" }),
        offers: {
          "@type": "Offer",
          price: i.price_vnd,
          priceCurrency: "VND",
          availability: i.is_sold_out ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        },
      })),
    })),
  };
}
