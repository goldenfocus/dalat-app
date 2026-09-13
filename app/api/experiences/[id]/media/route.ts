import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import convert from "heic-convert";
import {
  ownerExperience,
  experienceAdmin,
  safeMutation,
  bucket,
} from "@/lib/experiences/server";
import { audioFormat } from "@/lib/experiences/schema";
export const maxDuration = 60;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!safeMutation(request))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const owned = await ownerExperience(id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (owned.experience.status !== "draft")
    return NextResponse.json(
      { error: "Unpublish before editing" },
      { status: 409 },
    );
  const input = z
    .object({
      id: z.string().uuid(),
      mime: z.string().max(100),
      kind: z.enum(["photo", "audio"]),
      capture_mode: z.enum(["record", "live"]).default("record"),
    })
    .safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  const item = input.data;
  const mime = item.mime.split(";")[0];
  if (
    item.kind === "audio"
      ? !audioFormat(mime)
      : ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ].includes(mime)
  )
    return NextResponse.json({ error: "Unsupported file" }, { status: 400 });
  const admin = experienceAdmin();
  const { data: existing } = await admin
    .from("experience_media")
    .select("experience_id")
    .eq("id", item.id)
    .maybeSingle();
  if (existing)
    return existing.experience_id === id
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          { error: "File belongs to another draft" },
          { status: 403 },
        );
  const { count } = await admin
    .from("experience_media")
    .select("id", { head: true, count: "exact" })
    .eq("experience_id", id)
    .eq("kind", item.kind);
  if ((count || 0) >= (item.kind === "photo" ? 12 : 100))
    return NextResponse.json(
      { error: "Photo and recording limit reached" },
      { status: 400 },
    );
  const path = `${owned.user.id}/${id}/${item.id}`;
  const { data: file, error } = await admin.storage.from(bucket).download(path);
  if (error || !file || file.size > 20 * 1024 * 1024)
    return NextResponse.json(
      { error: "Upload the file first" },
      { status: 400 },
    );
  let preview_path: string | null = null;
  if (item.kind === "photo") {
    try {
      let bytes = Buffer.from(await file.arrayBuffer());
      if (["image/heic", "image/heif"].includes(mime))
        bytes = Buffer.from(
          await convert({ buffer: bytes, format: "JPEG", quality: 0.9 }),
        );
      const preview = await sharp(bytes, { limitInputPixels: 60000000 })
        .rotate()
        .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 86 })
        .toBuffer();
      preview_path = `${path}-preview.jpg`;
      const { error } = await admin.storage
        .from(bucket)
        .upload(preview_path, preview, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (error) throw error;
    } catch {
      return NextResponse.json(
        {
          error:
            "Original saved. This photo could not be prepared; retry or select a JPEG copy.",
        },
        { status: 422 },
      );
    }
  }
  const { error: saveError } = await admin.from("experience_media").insert({
    id: item.id,
    experience_id: id,
    path,
    preview_path,
    kind: item.kind,
    capture_mode: item.capture_mode,
    mime,
  });
  return saveError
    ? NextResponse.json(
        { error: "Original saved. Retry attaching it." },
        { status: 503 },
      )
    : NextResponse.json({ ok: true });
}
