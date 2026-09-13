import { normalizeVenueSearchText } from "@/lib/venues/search";
export type VenueCandidate = {
  id: string;
  name: string;
  address: string | null;
};
export function venueName(value: string) {
  return normalizeVenueSearchText(value)
    .replace(
      /\b(?:cafe|coffee|restaurant|dessert|dalat|da lat|quan|nha hang)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}
export function rankVenues(query: string, venues: VenueCandidate[]) {
  const name = venueName(query),
    compact = name.replace(/ /g, "");
  if (compact.length < 3) return [];
  return venues
    .map((venue) => {
      const candidate = venueName(venue.name),
        joined = candidate.replace(/ /g, "");
      const tokens = name.split(" "),
        others = candidate.split(" ");
      const overlap =
        tokens.filter((t) => others.includes(t)).length /
        Math.max(tokens.length, others.length);
      const rawQuery = normalizeVenueSearchText(query).replace(/ /g, "");
      const rawName = normalizeVenueSearchText(venue.name).replace(/ /g, "");
      const sameFullName =
        rawName.length >= 6 &&
        rawQuery.startsWith(rawName) &&
        rawName.length / rawQuery.length >= 0.65;
      const score =
        joined === compact
          ? 1
          : sameFullName
            ? 0.9
            : Math.min(compact.length, joined.length) >= 4 &&
                (joined.startsWith(compact) || compact.startsWith(joined))
              ? 0.8
              : normalizeVenueSearchText(query).length >= 5 &&
                  normalizeVenueSearchText(venue.address || "").includes(
                    normalizeVenueSearchText(query),
                  )
                ? 0.7
                : overlap;
      return { ...venue, address: venue.address || "", score };
    })
    .filter((v) => v.score >= 0.65)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
    .map(({ id, name, address }) => ({ id, name, address }));
}
