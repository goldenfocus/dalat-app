import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const BLOG_TRANSLATION_FIELDS = new Set([
  "title",
  "story_content",
  "technical_content",
  "meta_description",
]);

interface RefreshTranslationsRequest {
  postId?: string;
  fields?: string[];
  validateOnly?: boolean;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, can_blog")
    .eq("id", user.id)
    .single();
  const canBlog =
    profile?.role === "admin" ||
    profile?.role === "superadmin" ||
    profile?.can_blog === true;

  if (!canBlog) {
    return NextResponse.json({ error: "Blog access required" }, { status: 403 });
  }

  let body: RefreshTranslationsRequest;
  try {
    body = (await request.json()) as RefreshTranslationsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const postId = body.postId?.trim();
  const fields = [...new Set(body.fields || [])];

  if (!postId || fields.length === 0) {
    return NextResponse.json(
      { error: "postId and at least one field are required" },
      { status: 400 }
    );
  }

  if (fields.some((field) => !BLOG_TRANSLATION_FIELDS.has(field))) {
    return NextResponse.json({ error: "Unsupported translation field" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[blog/refresh-translations] Missing service-role configuration");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: protectedError, count: protectedCount } = await admin
    .from("content_translations")
    .select("id", { count: "exact", head: true })
    .eq("content_type", "blog")
    .eq("content_id", postId)
    .in("field_name", fields)
    .in("translation_status", ["reviewed", "edited"]);

  if (protectedError) {
    console.error("[blog/refresh-translations] Protection check failed:", protectedError);
    return NextResponse.json(
      { error: "Could not inspect blog translations" },
      { status: 500 }
    );
  }

  if ((protectedCount || 0) > 0) {
    return NextResponse.json(
      {
        error:
          "This edit affects reviewed translations. Update those translations manually before changing the source fields.",
      },
      { status: 409 }
    );
  }

  if (body.validateOnly) {
    return NextResponse.json({ success: true, protected: 0 });
  }

  const { error, count } = await admin
    .from("content_translations")
    .delete({ count: "exact" })
    .eq("content_type", "blog")
    .eq("content_id", postId)
    .in("field_name", fields)
    .eq("translation_status", "auto");

  if (error) {
    console.error("[blog/refresh-translations] Delete failed:", error);
    return NextResponse.json(
      { error: "Could not refresh blog translations" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, removed: count || 0 });
}
