import { createClient } from "@/lib/supabase/server";
import { bucket, experienceAdmin } from "@/lib/experiences/server";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const { id, mediaId } = await params;
  const db = await createClient();
  const { data: media } = await db
    .from("experience_media")
    .select("*")
    .eq("id", mediaId)
    .eq("experience_id", id)
    .maybeSingle();
  if (!media) return new Response(null, { status: 404 });
  const original = new URL(request.url).searchParams.get("original") === "1";
  if (original || media.kind === "audio") {
    const {
      data: { user },
    } = await db.auth.getUser();
    const { data: owner } = user
      ? await db
          .from("experiences")
          .select("id")
          .eq("id", id)
          .eq("author_id", user.id)
          .maybeSingle()
      : { data: null };
    if (!owner) return new Response(null, { status: 404 });
  }
  const path =
    original || media.kind === "audio" ? media.path : media.preview_path;
  if (!path) return new Response(null, { status: 404 });
  const { data, error } = await experienceAdmin()
    .storage.from(bucket)
    .download(path);
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type":
        original || media.kind === "audio" ? media.mime : "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(original ? { "Content-Disposition": "attachment" } : {}),
    },
  });
}
