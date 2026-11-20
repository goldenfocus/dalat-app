import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });
  const type = request.headers.get("content-type") || "";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type)) return new Response(null, { status: 415 });
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 3_500_000) return new Response(null, { status: 413 });
  let image: Buffer;
  try {
    image = await sharp(Buffer.from(bytes), { limitInputPixels: 32_000_000 })
      .rotate().resize({ width: 1500, height: 1500, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 }).toBuffer();
  } catch {
    return new Response(null, { status: 422 });
  }
  const path = user.id + "/" + crypto.randomUUID() + ".webp";
  const { error } = await db.storage.from("rental-photos").upload(path, image, { contentType: "image/webp", upsert: false });
  return error ? new Response(null, { status: 503 }) : Response.json({ src: "/api/rentals/photos/" + path });
}
