import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const body = z.object({
  contactEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(40).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { contactEmail, contactPhone, note } = parsed.data;
  if (!contactEmail && !contactPhone && !note)
    return NextResponse.json({ error: "proof_required" }, { status: 400 });
  // RLS: only for yourself, only pending, only while the venue has no owner.
  const { error } = await db.from("venue_claims").insert({
    venue_id: id,
    user_id: user.id,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    note: note || null,
  });
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json({ error: dup ? "already_pending" : "not_claimable" }, { status: dup ? 409 : 403 });
  }
  return NextResponse.json({ ok: true });
}
