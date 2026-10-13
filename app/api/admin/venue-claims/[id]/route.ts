import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { experienceAdmin } from "@/lib/experiences/server";

/** Superadmin/admin approves or rejects a venue claim. Approval sets the owner. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "superadmin"].includes(me?.role || ""))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = z.object({ action: z.enum(["approve", "reject"]) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const admin = experienceAdmin();
  const { data: claim } = await admin.from("venue_claims").select("*").eq("id", id).eq("status", "pending").maybeSingle();
  if (!claim) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const reviewed = { reviewed_by: user.id, reviewed_at: new Date().toISOString() };
  if (parsed.data.action === "reject") {
    await admin.from("venue_claims").update({ status: "rejected", ...reviewed }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  const { data: venue, error } = await admin
    .from("venues")
    .update({ owner_id: claim.user_id, is_verified: true, updated_at: new Date().toISOString() })
    .eq("id", claim.venue_id)
    .is("owner_id", null)
    .select("id")
    .maybeSingle();
  if (error || !venue) return NextResponse.json({ error: "already_owned" }, { status: 409 });
  await admin.from("venue_managers").upsert(
    { venue_id: claim.venue_id, profile_id: claim.user_id, role: "owner", invited_by: user.id, invited_at: reviewed.reviewed_at, accepted_at: reviewed.reviewed_at },
    { onConflict: "venue_id,profile_id" },
  );
  await admin.from("venue_claims").update({ status: "approved", ...reviewed }).eq("id", id);
  await admin.from("venue_claims").update({ status: "rejected", ...reviewed }).eq("venue_id", claim.venue_id).eq("status", "pending");
  return NextResponse.json({ ok: true, status: "approved" });
}
