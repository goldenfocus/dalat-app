export async function resolveCanonicalEventSlug(
  supabase: { from: (table: string) => any },
  slug: string,
): Promise<string | null> {
  const { data: currentEvent } = await supabase
    .from("events")
    .select("slug")
    .eq("slug", slug)
    .single();

  if (currentEvent?.slug) {
    return currentEvent.slug;
  }

  const { data: redirectedEvent, error } = await supabase
    .from("events")
    .select("slug")
    .contains("previous_slugs", [slug])
    .single();

  if (error) {
    return null;
  }

  return redirectedEvent?.slug ?? null;
}
