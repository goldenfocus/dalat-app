import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";

/**
 * Route segments that live under /tribes/ — a tribe with one of these slugs
 * would be shadowed by the real page and never reachable.
 */
const RESERVED_TRIBE_SLUGS = new Set(["new", "join"]);

const MAX_TRIBE_SLUG_LENGTH = 60;

export type TribeSlugError = "slug_invalid" | "slug_reserved" | "slug_taken";

export function normalizeTribeSlug(input: string): string {
  return slugify(input).slice(0, MAX_TRIBE_SLUG_LENGTH).replace(/-$/, "");
}

export function isReservedTribeSlug(slug: string): boolean {
  return RESERVED_TRIBE_SLUGS.has(slug);
}

/**
 * Bump to the next candidate: "run-club" -> "run-club-2" -> "run-club-3".
 *
 * findAvailableTribeSlug reads through RLS, which hides secret tribes from
 * non-members — so a slug it calls free can still collide with the UNIQUE
 * index. The insert retries with this rather than failing.
 */
export function nextTribeSlugCandidate(slug: string): string {
  const numbered = slug.match(/^(.*)-(\d+)$/);
  return numbered ? `${numbered[1]}-${Number(numbered[2]) + 1}` : `${slug}-2`;
}

/**
 * Clean slug first, numbered suffix only if something already has it.
 * "DaLat Cycling Group" -> "dalat-cycling-group", then -2, -3, ...
 *
 * Best-effort by design: RLS can hide conflicting rows, so callers must still
 * handle a 23505 from the insert. The DB index is the authority, not this.
 */
export async function findAvailableTribeSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = normalizeTribeSlug(name) || "tribe";

  // One round trip: the base plus every numbered sibling it already spawned
  const { data, error } = await supabase
    .from("tribes")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);

  if (error) throw error;

  const taken = new Set((data ?? []).map((row) => row.slug as string));
  if (!taken.has(base) && !isReservedTribeSlug(base)) return base;

  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}
