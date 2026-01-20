import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Search by username prefix (case insensitive)
  // Also search display_name for flexibility
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.${cleanQuery}%,display_name.ilike.%${cleanQuery}%`)
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
