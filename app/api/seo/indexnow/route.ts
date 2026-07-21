import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pingIndexNow } from "@/lib/seo/indexnow";

/**
 * POST /api/seo/indexnow
 * Body: { paths: string[] } — site-relative paths to submit to IndexNow.
 *
 * Called fire-and-forget from client flows that publish/update content
 * (event form, etc.). Requires a signed-in user — pings only fire from
 * real content mutations, not drive-by requests.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let paths: unknown;
  try {
    ({ paths } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === "string" && p.startsWith("/"))) {
    return NextResponse.json({ error: "paths must be site-relative strings" }, { status: 400 });
  }

  await pingIndexNow(paths as string[]);
  return NextResponse.json({ ok: true });
}
