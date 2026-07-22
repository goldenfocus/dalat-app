import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Escape a user-supplied term for use inside a PostgREST `.or()` filter string.
 *
 * `.or()` takes a comma-separated list of `column.op.value` clauses, so a raw
 * comma or parenthesis in `query` does not merely fail to match — it changes
 * the SHAPE of the filter (splitting a clause, closing a group). This term was
 * previously spliced in unescaped. PostgREST allows a double-quoted value with
 * `\` and `"` backslash-escaped inside, which neutralises every structural
 * character in one step.
 *
 * `%` and `_` are stripped as well: they are ILIKE wildcards, and letting a
 * searcher inject `%` turns a two-character search into "match everything" —
 * the whole user directory in one request.
 */
function escapeOrFilterValue(value: string): { pattern: string; isEmpty: boolean } {
  const escaped = value
    .replace(/[%_]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  return { pattern: `"%${escaped}%"`, isEmpty: escaped.length === 0 };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isStaff =
    !!profile && ["superadmin", "admin", "moderator"].includes(profile.role);

  // Tribe leaders need user search to invite by username — without it their
  // dropdown was silently empty. Anyone can create a tribe and become its
  // leader, so in practice this approaches "any signed-in user"; the
  // `discoverable` filter below is the mitigation, and it is why escaping the
  // term is a precondition of this widening rather than a separate cleanup.
  let isTribeLeader = false;
  if (!isStaff) {
    const { data: leaderships } = await supabase
      .from("tribe_members")
      .select("id")
      .eq("user_id", user.id)
      .in("role", ["leader", "admin"])
      .eq("status", "active")
      .limit(1);
    isTribeLeader = (leaderships?.length ?? 0) > 0;
  }

  // Event creators get the same access, for the same reason: the event page
  // hands every creator the invite / "add who was there" modal, whose username
  // search hits this route — gating them out produced a silent 403 and a
  // permanently empty dropdown. Same `discoverable` mitigation applies.
  let isEventCreator = false;
  if (!isStaff && !isTribeLeader) {
    const { data: ownedEvents } = await supabase
      .from("events")
      .select("id")
      .eq("created_by", user.id)
      .limit(1);
    isEventCreator = (ownedEvents?.length ?? 0) > 0;
  }

  if (!isStaff && !isTribeLeader && !isEventCreator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { pattern, isEmpty } = escapeOrFilterValue(query);
  // Stripping wildcards can empty the term (e.g. q="%%"), and `%%` matches
  // every profile — bail rather than dumping the directory.
  if (isEmpty) {
    return NextResponse.json({ users: [] });
  }

  let builder = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .eq("is_ghost", false);

  // Profile opt-out, honoured for leaders only: moderation tools must still be
  // able to find everyone, and staff already have unrestricted profile access.
  if (!isStaff) {
    builder = builder.eq("discoverable", true);
  }

  const { data: users, error } = await builder.limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}
