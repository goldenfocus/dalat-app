import { revalidateTag, revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache/server-cache";

/**
 * Cache invalidation API endpoint.
 *
 * Supports:
 * - Webhook-triggered invalidation (via secret)
 * - Admin-triggered invalidation (via auth)
 *
 * Usage:
 * POST /api/revalidate
 * Body: { tag?: string, path?: string, type?: 'events' | 'translations' | 'moments' | 'blog' }
 *
 * Headers:
 * - Authorization: Bearer <CACHE_REVALIDATE_SECRET> (for webhooks)
 * - Cookie: <session> (for admin users)
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Check authorization
  const authHeader = request.headers.get("authorization");
  const webhookSecret = process.env.CACHE_REVALIDATE_SECRET;

  // Allow webhook secret or admin user
  if (authHeader !== `Bearer ${webhookSecret}`) {
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

    if (profile?.role !== "admin" && profile?.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const { tag, path, type } = await request.json();

    // Revalidate by tag
    if (tag) {
      revalidateTag(tag, "max");
      return NextResponse.json({
        revalidated: true,
        tag,
        timestamp: new Date().toISOString(),
      });
    }

    // Revalidate by path
    if (path) {
      revalidatePath(path);
      return NextResponse.json({
        revalidated: true,
        path,
        timestamp: new Date().toISOString(),
      });
    }

    // Revalidate by content type (convenience method)
    if (type) {
      const revalidatedTags: string[] = [];

      switch (type) {
        case "events":
          revalidateTag(CACHE_TAGS.events, "max");
          revalidatePath("/");
          revalidatePath("/events/this-week");
          revalidatedTags.push(CACHE_TAGS.events);
          break;

        case "translations":
          revalidateTag(CACHE_TAGS.translations, "max");
          revalidatedTags.push(CACHE_TAGS.translations);
          break;

        case "moments":
          revalidateTag(CACHE_TAGS.moments, "max");
          revalidateTag(CACHE_TAGS.momentsFeed, "max");
          revalidatedTags.push(CACHE_TAGS.moments, CACHE_TAGS.momentsFeed);
          break;

        case "blog":
          revalidateTag(CACHE_TAGS.blog, "max");
          revalidatePath("/blog");
          revalidatedTags.push(CACHE_TAGS.blog);
          break;

        default:
          return NextResponse.json(
            { error: `Unknown type: ${type}` },
            { status: 400 }
          );
      }

      return NextResponse.json({
        revalidated: true,
        type,
        tags: revalidatedTags,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: "Missing tag, path, or type parameter" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Revalidation error:", error);
    return NextResponse.json(
      { error: "Failed to revalidate" },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    availableTags: Object.keys(CACHE_TAGS),
    availableTypes: ["events", "translations", "moments", "blog"],
  });
}
