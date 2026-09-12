import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerExperience,
  experienceAdmin,
  safeMutation,
  bucket,
} from "@/lib/experiences/server";
import { saveSchema } from "@/lib/experiences/schema";
import { publicationReady } from "@/lib/experiences/publication";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: source }, { data: media }] = await Promise.all([
    owned.db
      .from("experience_sources")
      .select("*")
      .eq("experience_id", id)
      .single(),
    owned.db
      .from("experience_media")
      .select("*")
      .eq("experience_id", id)
      .order("created_at"),
  ]);
  return NextResponse.json(
    { experience: owned.experience, source, media: media || [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PATCH(request: Request, { params }: Context) {
  if (!safeMutation(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = z
    .object({
      action: z.enum(["save", "publish", "unpublish"]),
      story: saveSchema,
      notes: z.string().max(18000).optional(),
    })
    .safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check your draft fields" },
      { status: 400 },
    );
  const { action, story, notes } = parsed.data;
  const admin = experienceAdmin();
  if (owned.experience.status === "published" && action !== "unpublish")
    return NextResponse.json(
      { error: "Unpublish before editing" },
      { status: 409 },
    );
  if (story.venue_id) {
    const { data: venue } = await owned.db
      .from("venues")
      .select("id,name,address")
      .eq("id", story.venue_id)
      .single();
    if (!venue)
      return NextResponse.json(
        { error: "Choose a valid venue" },
        { status: 400 },
      );
    story.venue_name = venue.name;
    story.venue_address = venue.address || "";
  }
  const { data: media } = await admin
    .from("experience_media")
    .select("id,preview_path")
    .eq("experience_id", id)
    .eq("kind", "photo");
  const available = new Set(
    (media || []).filter((m) => m.preview_path).map((m) => m.id),
  );
  if (story.selected_media.some((m) => !available.has(m)))
    return NextResponse.json(
      { error: "Wait for your photographs to finish uploading" },
      { status: 400 },
    );
  if (
    action === "publish" &&
    !publicationReady(
      story,
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
    )
  )
    return NextResponse.json(
      {
        error:
          "Review the story, venue, visit date and photo permissions before publishing",
      },
      { status: 400 },
    );
  // Pending identity is separate from canonical venues; no fabricated coordinates.
  if (
    story.venue_confirmed &&
    !story.venue_id &&
    story.venue_name &&
    story.venue_address
  ) {
    const { error } = await admin.from("experience_venue_submissions").upsert({
      experience_id: id,
      name: story.venue_name,
      address: story.venue_address,
    });
    if (error)
      return NextResponse.json(
        { error: "Venue could not be saved" },
        { status: 503 },
      );
  }
  if (notes !== undefined) {
    const { error } = await admin
      .from("experience_sources")
      .update({ notes })
      .eq("experience_id", id);
    if (error)
      return NextResponse.json(
        { error: "Notes could not be saved" },
        { status: 503 },
      );
  }
  // Source excerpts stay private in experience_sources.generation; published observations expose context only.
  story.photos = story.photos.filter((p) =>
    story.selected_media.includes(p.id),
  );
  story.observations = story.observations.map((o) => ({ ...o, evidence: "" }));
  const { error } = await admin
    .from("experiences")
    .update({
      ...story,
      status: action === "publish" ? "published" : "draft",
      published_at:
        action === "publish"
          ? owned.experience.published_at || new Date().toISOString()
          : owned.experience.published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("author_id", owned.user.id);
  return error
    ? NextResponse.json({ error: "Draft could not be saved" }, { status: 503 })
    : NextResponse.json({
        ok: true,
        status: action === "publish" ? "published" : "draft",
      });
}
export async function DELETE(request: Request, { params }: Context) {
  if (!safeMutation(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = experienceAdmin();
  // Hide the page first; never delete original files while leaving a public page.
  const { error: hidden } = await admin
    .from("experiences")
    .update({ status: "draft" })
    .eq("id", id);
  if (hidden)
    return NextResponse.json({ error: "Could not delete" }, { status: 503 });
  const { data: files, error: listError } = await admin.storage
    .from(bucket)
    .list(`${owned.user.id}/${id}`, { limit: 100 });
  if (listError)
    return NextResponse.json(
      { error: "Could not delete files; please retry" },
      { status: 503 },
    );
  if (files?.length) {
    const { error } = await admin.storage
      .from(bucket)
      .remove(files.map((f) => `${owned.user.id}/${id}/${f.name}`));
    if (error)
      return NextResponse.json(
        { error: "Could not delete files; please retry" },
        { status: 503 },
      );
  }
  const { error } = await admin.from("experiences").delete().eq("id", id);
  return error
    ? NextResponse.json({ error: "Could not delete" }, { status: 503 })
    : NextResponse.json({ ok: true });
}
