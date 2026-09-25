import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorizeBearerSecret } from "@/lib/import/bearer-authorization";
import { ingestScoutEvent } from "@/lib/import/scout-ingest";
import { scoutIngestSchema } from "@/lib/import/scout-schema";

export const maxDuration = 300;

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
  const authorization = authorizeBearerSecret(request, "SCOUT_INGEST_KEY");
  if (!authorization.ok) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = scoutIngestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await ingestScoutEvent(serviceClient(), parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          starts_at: result.starts_at,
        },
        { status: result.status },
      );
    }
    return NextResponse.json({
      id: result.id,
      slug: result.slug,
      status: result.status,
      created: result.created,
      updated: result.updated,
      duplicate: result.duplicate,
    });
  } catch (error) {
    console.error("[import/scout]", error);
    return NextResponse.json(
      { error: "Failed to ingest scout draft" },
      { status: 500 },
    );
  }
}
