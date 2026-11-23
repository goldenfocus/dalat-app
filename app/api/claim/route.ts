import { NextResponse } from "next/server";
import { z } from "zod";
import { experienceAdmin } from "@/lib/experiences/server";
import { createClient } from "@/lib/supabase/server";

const claimRequest = z.object({
  entityType: z.literal("organizer"),
  entitySlug: z.string().trim().min(1).max(200),
  message: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = claimRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { data: accepted, error } = await experienceAdmin().rpc("submit_organizer_claim", {
    p_slug: parsed.data.entitySlug,
    p_user_id: user.id,
    p_email: user.email ?? null,
    p_note: parsed.data.message || null,
  });
  if (error) {
    console.error("Organizer claim submission failed:", error.code);
    return NextResponse.json({ error: "submission_failed" }, { status: 500 });
  }
  if (!accepted) return NextResponse.json({ error: "not_claimable" }, { status: 409 });
  return NextResponse.json({ success: true });
}
