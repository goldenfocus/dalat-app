import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Escape user input for safe use in PostgREST .or() filters.
 * PostgREST uses double-quoted strings, so we:
 * 1. Escape double quotes by doubling them
 * 2. Escape SQL LIKE wildcards (% and _) with backslash
 * 3. Strip any control characters
 */
function escapePostgrestValue(input: string): string {
  return input
    .replace(/[\x00-\x1f\x7f]/g, "") // Remove control characters
    .replace(/"/g, '""') // Escape double quotes
    .replace(/[%_]/g, "\\$&"); // Escape SQL wildcards
}

/**
 * GET /api/users/search?q=username
 * Search for users by username prefix
 * Returns basic profile info for autocomplete in invite flows
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  // Require authentication to prevent enumeration attacks
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim().toLowerCase();

  // Remove @ prefix if present
  const cleanQuery = query?.replace(/^@/, "") || "";

  if (!cleanQuery || cleanQuery.length < 2) {
    return NextResponse.json({ users: [] });
  }

  // Escape user input to prevent PostgREST filter injection
  const escapedQuery = escapePostgrestValue(cleanQuery);

  // Search by username prefix (case insensitive)
  // Also search display_name for flexibility
  // PostgREST requires double-quoting values with wildcards
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike."${escapedQuery}%",display_name.ilike."%${escapedQuery}%"`)
    .not("username", "is", null) // Only return users with usernames
    .neq("id", user.id) // Exclude self
    .limit(5);

  if (error) {
    console.error("User search error:", error);
    return NextResponse.json({ users: [] });
  }

  return NextResponse.json({
    users:
      users?.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
      })) || [],
  });
}
