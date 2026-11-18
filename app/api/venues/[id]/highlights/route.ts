import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { venueEditor } from "@/lib/venues/access";
import { experienceAdmin } from "@/lib/experiences/server";
import { getVenueHighlightPhotos } from "@/lib/venues/highlights-server";

const schema = z.object({ momentIds: z.array(z.string().uuid()).max(6).refine(ids => new Set(ids).size === ids.length) }).strict();

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const editor = await venueEditor(id);
  if (!editor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const available = new Set((await getVenueHighlightPhotos(id)).map(photo => photo.id));
  if (parsed.data.momentIds.some(moment => !available.has(moment))) return NextResponse.json({ error: "invalid_photo" }, { status: 400 });
  const { error } = await experienceAdmin().from("venues").update({ highlight_moment_ids: parsed.data.momentIds }).eq("id", id);
  if (error) return NextResponse.json({ error: "save_failed" }, { status: 503 });
  revalidatePath("/[locale]/[slug]", "page");
  return NextResponse.json({ ok: true });
}
