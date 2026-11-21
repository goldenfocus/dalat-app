export const searchKinds = ["rentals", "events", "people", "texts", "blog", "news", "experiences", "venues"] as const;
export type SearchKind = (typeof searchKinds)[number];
export type SearchScope = SearchKind | "all";

export type DalatSearchResult = {
  id: string;
  kind: SearchKind;
  href: string;
  title: string;
  originalTitle?: string;
  sourceLocale?: string;
};

export function searchScope(input: string | null | undefined): SearchScope {
  return searchKinds.find(kind => kind === input) ?? "all";
}

export function normalizeSearchQuery(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/đ/g, "d").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function cleanSearchQuery(value: string) {
  return Array.from(value.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").trim()).slice(0, 100).join("");
}

export function searchResultsHref(query: string, scope: SearchScope) {
  const params = new URLSearchParams({ q: query });
  if (scope !== "all") params.set("type", scope);
  return "/search?" + params.toString();
}

export const searchDestinations: Record<SearchKind, string> = {
  rentals: "/rentals",
  events: "/events/upcoming",
  people: "/people",
  texts: "/moments",
  blog: "/blog",
  news: "/news",
  experiences: "/experiences",
  venues: "/venues",
};

const synonyms: Record<SearchKind, string[]> = {
  rentals: ["rent", "rental", "rentals", "property", "real estate", "housing", "apartment", "villa",
    "thue nha", "cho thue", "nha cho thue", "can ho", "location", "locations", "immobilier", "miete"],
  events: ["events", "event", "calendar", "su kien", "evenement", "evenements"],
  people: ["people", "person", "members", "member", "nguoi dung", "thanh vien", "membres", "personnes"],
  texts: ["text", "texts", "moments", "post", "posts", "bai viet"],
  blog: ["blog", "blogs"],
  news: ["news", "tin tuc", "actualites", "nachrichten"],
  experiences: ["experience", "experiences", "trai nghiem"],
  venues: ["venue", "venues", "places", "dia diem", "lieux"],
};
const typeTerms = new Map(searchKinds.flatMap(kind => synonyms[kind].map(term => [term, kind] as const)));

export function searchIntent(query: string) {
  const normalized = normalizeSearchQuery(query);
  const exact = typeTerms.get(normalized);
  if (exact) return exact;
  const words = normalized.split(" ");
  for (const size of [3, 2, 1]) {
    for (let index = 0; index <= words.length - size; index++) {
      const kind = typeTerms.get(words.slice(index, index + size).join(" "));
      if (kind) return kind;
    }
  }
}

export function searchShortcut(query: string, labels: Record<SearchKind, string>, scope: SearchScope) {
  const normalized = normalizeSearchQuery(query);
  const kind = typeTerms.get(normalized) ?? searchKinds.find(kind => normalizeSearchQuery(labels[kind]) === normalized);
  return kind && (scope === "all" || scope === kind) ? kind : null;
}

// Diagnostics store only normalized aggregate query strings. Common forms of
// contact details and link-like input are never copied into the stats store.
export function analyticsSearchQuery(input: string) {
  const query = cleanSearchQuery(input);
  if (/\S+@\S+|(?:https?:\/\/|www\.)|(?:\d[\s.+()-]*){7,}/i.test(query)) return "";
  return normalizeSearchQuery(query);
}
