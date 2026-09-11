import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeBearerSecret } from "@/lib/import/bearer-authorization";
import {
  evaluateReviewEvent,
  loadReviewEvent,
  publishReviewEvent,
  qaReviewEvent,
} from "@/lib/import/review-gate";
import { reviewIngestSchema } from "@/lib/import/scout-schema";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const authorization = authorizeBearerSecret(request, "REVIEW_INGEST_KEY");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reviewIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const supabase = serviceClient();
    const event = await loadReviewEvent(supabase, parsed.data);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (parsed.data.action === "qa") {
      const qa = await qaReviewEvent(supabase, event);
      return NextResponse.json({ action: "qa", ...qa });
    }

    if (parsed.data.action === "evaluate") {
      const evaluation = await evaluateReviewEvent(supabase, event);
      return NextResponse.json({ action: "evaluate", ...evaluation });
    }

    const published = await publishReviewEvent(supabase, event);
    return NextResponse.json({ action: "publish", ...published });
  } catch (error) {
    console.error("[import/review]", error);
    return NextResponse.json(
      { error: "Failed to review event" },
      { status: 500 },
    );
  }
}
