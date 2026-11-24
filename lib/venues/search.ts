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

/** Compare the numbered street line independently of its district and city. */
export function normalizeVenueStreet(value: string | null | undefined): string {
  return normalizeVenueSearchText((value ?? "").split(",")[0])
    .replace(/^(?:d|duong|street) /, "")
    .replace(/^(\d+) ?(bis|[a-ce-z])(?= )/, "$1$2")
    .replace(/^0+(?=\d)/, "")
    .replace(/^(\d+[a-z]*) (?:d|duong|street|st) /, "$1 ");
}

export function rankVenueSearchMatch(venue: SearchableVenue, query: string): number {
  const name = normalizeVenueSearchText(venue.name);
  const term = normalizeVenueSearchText(query);
  const street = normalizeVenueStreet(query);
  const address = normalizeVenueStreet(venue.address);

  if (name === term || normalizeVenueSearchText(venue.slug ?? "") === term) return 4;
  if (/^\d+\p{L}* \p{L}/u.test(street)) {
    if (street === address) return 3;
    if (address.startsWith(street)) return 2;
  }
  if (name.startsWith(term)) return 2;
  return term.length >= 3 && name.includes(term) ? 1 : 0;
}
