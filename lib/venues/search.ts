type SearchableVenue = {
  name: string;
  address?: string | null;
  slug?: string | null;
};

/**
 * Normalize human-entered venue searches without losing non-Latin scripts.
 * Vietnamese diacritics are folded so "Pho Ben Doi" matches "Phố Bên Đồi".
 */
export function normalizeVenueSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function venueMatchesSearch(venue: SearchableVenue, query: string): boolean {
  const normalizedQuery = normalizeVenueSearchText(query);
  if (!normalizedQuery) return true;

  const compactQuery = normalizedQuery.replace(/\s/g, "");
  return [venue.name, venue.address, venue.slug].some((value) => {
    if (!value) return false;
    const normalizedValue = normalizeVenueSearchText(value);
    return (
      normalizedValue.includes(normalizedQuery) ||
      normalizedValue.replace(/\s/g, "").includes(compactQuery)
    );
  });
}
