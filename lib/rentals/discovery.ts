import { createHash } from "node:crypto";
import type { RentalListing } from "./data";
import { isRentalAmenityExtra, rentalDetails, rentalDetailTranslations } from "./details";

export const filterGroups = ["amenities", "area", "rules"] as const;
export const roomMinimumKeys = ["bedrooms", "bathrooms"] as const;
type RoomMinimumKey = (typeof roomMinimumKeys)[number];
export type RentalRoomMinimums = Partial<Record<RoomMinimumKey, number>>;
type FilterGroup = (typeof filterGroups)[number];
type Filter = { group: FilterGroup; key: string; label: string; original?: string };
type Localize = (key: string) => string;

export function normalizeRentalSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
    .replaceAll("đ", "d").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function readRentalRoomMinimums(
  params: Partial<Record<RoomMinimumKey, string | string[]>>,
  legacyFilters: readonly string[],
): RentalRoomMinimums {
  const minimums: RentalRoomMinimums = {};
  for (const key of roomMinimumKeys) {
    const value = params[key];
    if (typeof value === "string" && /^[1-9]\d{0,2}$/.test(value)) minimums[key] = Number(value);
    else if (legacyFilters.includes("rooms:" + key)) minimums[key] = 1;
  }
  return minimums;
}

export function rentalDiscovery(listing: RentalListing, strings: Map<string, string> | undefined, t: Localize) {
  const details = rentalDetails(listing.details);
  const translated = rentalDetailTranslations(strings?.get("tags"), details.custom.length);
  const filters: Filter[] = [];
  function add(group: FilterGroup, key: string, label: string, original?: string) {
    filters.push({ group, key: group + ":" + key, label, original });
  }
  for (const key of details.amenities) add("amenities", key, t(key));
  for (const key of details.area) add("area", key, t(key));
  for (const [key, status] of Object.entries(details.utilities)) {
    if (status === "included") add("amenities", key + ":" + status, t(key));
  }
  for (const [key, status] of Object.entries(details.rules)) {
    if (status === "allowed") add("rules", key + ":" + status, t(key) + " · " + t(status));
  }
  details.custom.forEach((fact, index) => {
    if (fact.group === "rooms" || fact.group === "rules" ||
      (fact.group === "amenities" && isRentalAmenityExtra(fact.pricing))) return;
    const group = fact.group === "nearby" ? "area" : fact.group;
    const label = translated[index] ?? fact.label;
    const normalized = fact.label.normalize("NFC").trim().toLowerCase();
    const key = "custom:" + createHash("sha256").update(normalized).digest("base64url").slice(0, 22);
    add(group, key, label, fact.label);
  });
  const text = normalizeRentalSearch([
    "Đà Lạt", t(listing.offer_type), listing.title, listing.description, strings?.get("title"), strings?.get("description"),
    details.propertySize && details.propertySize + " m²",
    ...filters.flatMap(fact => [fact.label, fact.original]),
    ...Object.entries(details.rooms).map(([key, count]) => count + " " + t(key)),
    ...details.custom.flatMap((fact, index) => fact.group === "rooms"
      ? [fact.count + " " + fact.label, translated[index]] : []),
  ].filter(Boolean).join(" "));
  return { filters, text, rooms: details.rooms };
}

export function matchesRental(
  discovery: ReturnType<typeof rentalDiscovery>,
  query: string,
  selected: readonly string[],
  minimums: RentalRoomMinimums = {},
) {
  const words = normalizeRentalSearch(query).split(" ").filter(Boolean);
  return words.every(word => discovery.text.includes(word))
    && selected.every(key => discovery.filters.some(fact => fact.key === key))
    && roomMinimumKeys.every(key => (discovery.rooms[key] ?? 0) >= (minimums[key] ?? 0));
}

export function rentalBrowseHref(query: string, filters: string[], tours: boolean, minimums: RentalRoomMinimums = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  for (const filter of filters) params.append("filter", filter);
  for (const key of roomMinimumKeys) {
    const count = minimums[key];
    if (count) params.set(key, String(count));
  }
  if (tours) params.set("browse", "tours");
  return params.size ? "/rentals?" + params : "/rentals";
}
