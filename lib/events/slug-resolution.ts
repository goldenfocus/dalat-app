/**
 * Resolve a public event URL slug to the current canonical slug.
 *
 * Lookups use `.limit()` rather than `.single()`. PostgREST answers `.single()`
 * misses with HTTP 406, and Next.js's patched `fetch` can fail the whole
 * Server Component render on that status — so the previous_slugs redirect
 * never runs and logged-out browsers see a soft 404. Crawler middleware
 * already avoided `.single()` and therefore already redirected correctly.
 */
export async function resolveCanonicalEventSlug(
  supabase: { from: (table: string) => any },
  slug: string,
): Promise<string | null> {
  const { data: currentRows } = await supabase
    .from("events")
    .select("slug")
    .eq("slug", slug)
    .limit(1);

  if (currentRows?.[0]?.slug) {
    return currentRows[0].slug;
  }

  const { data: redirectedRows } = await supabase
    .from("events")
    .select("slug, status")
    .contains("previous_slugs", [slug])
    .limit(10);

  const redirected =
    redirectedRows?.find(
      (event: { status?: string | null }) => event.status === "published",
    ) ?? redirectedRows?.[0];

  return redirected?.slug ?? null;
}
