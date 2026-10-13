import { NextResponse } from "next/server";
import { z } from "zod";
import { venueEditor } from "@/lib/venues/access";
import { experienceAdmin } from "@/lib/experiences/server";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.union([z.literal("closed"), z.object({ open: time, close: time })]);
const url = z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u)).nullable();
const body = z.object({
  description: z.string().trim().max(4000).nullable(),
  phone: z.string().trim().max(40).nullable(),
  email: z.string().trim().email().max(200).nullable(),
  website_url: url,
  facebook_url: url,
  instagram_url: url,
  logo_url: url,
  cover_photo_url: url,
  operating_hours: z
    .object({ monday: day, tuesday: day, wednesday: day, thursday: day, friday: day, saturday: day, sunday: day })
    .partial()
    .nullable(),
}).partial();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const editor = await venueEditor(id);
  if (!editor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.slice(0, 3) }, { status: 400 });
  const clean = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => [k, typeof v === "string" && !v ? null : v]),
  );
  // Managers are not covered by the owner RLS policy; access was checked above.
  const { error } = await experienceAdmin()
    .from("venues")
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error
    ? NextResponse.json({ error: "save_failed" }, { status: 503 })
    : NextResponse.json({ ok: true });
}
