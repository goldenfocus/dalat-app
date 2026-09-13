// Small, explicit equivalence groups. Similar impressions are not synonyms:
// quiet does not imply peaceful, and vegetarian does not imply vegan.
const groups: Record<string, string[]> = {
  quiet: [
    "quiet",
    "yên tĩnh",
    "yen tinh",
    "silencieux",
    "silencieuse",
    "ruhig",
  ],
  peaceful: ["peaceful", "bình yên", "paisible"],
  vegetarian: ["vegetarian", "chay", "végétarien", "végétarienne"],
  vegan: ["vegan", "thuần chay", "végétalien", "végétalienne"],
  buffet: ["buffet"],
  spicy: ["spicy", "cay", "épicé", "épicée"],
  salty: ["salty", "mặn", "salé", "salée"],
  sweet: ["sweet", "sugary", "ngọt", "sucré", "sucrée"],
  tasty: ["tasty", "ngon", "savoureux", "savoureuse"],
  savory: ["savory", "savoury"],
  wifi: ["wifi", "wi fi"],
};
export function normalizeTopic(value: string) {
  return value
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[-_\s]+/g, " ")
    .trim();
}
export function topic(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const normalized = normalizeTopic(value);
  if (
    !normalized ||
    normalized.length > 50 ||
    !/^[\p{L}\p{N} ]+$/u.test(normalized)
  )
    return;
  return (
    Object.keys(groups).find((key) => groups[key].includes(normalized)) ||
    normalized
  );
}
export function topicTerms(value: string) {
  const key = topic(value);
  return key ? (Object.hasOwn(groups, key) ? groups[key] : [key]) : [];
}
export function topicHref(value: string, category?: string, page = 1) {
  const params = new URLSearchParams({ tag: topic(value) || value });
  if (category) params.set("category", category);
  if (page > 1) params.set("page", String(page));
  return `/experiences?${params}`;
}
export function observationParts(
  value: string,
  tags: string[],
  source: string,
) {
  const known = new Set(tags.map(topic).filter(Boolean));
  return value.split(/(,\s*|;\s*| \/ | and | và | et )/i).map((text, i) => {
    const key = topic(text);
    return {
      text,
      topic:
        i % 2 === 0 &&
        (source === "firsthand" || source === "impression") &&
        key &&
        (Object.hasOwn(groups, key) || known.has(key))
          ? key
          : undefined,
    };
  });
}
export function experienceTopics(
  tags: string[],
  observations: { value: string; source_type: string }[],
) {
  return [
    ...new Set(
      [
        ...tags.map(topic),
        ...observations.flatMap((o) =>
          observationParts(o.value, tags, o.source_type).map((p) => p.topic),
        ),
      ].filter((v): v is string => !!v),
    ),
  ].slice(0, 24);
}
