import { createClient } from "@/lib/supabase/server";
import { isRentalPhotoPath } from "@/lib/rentals/data";

export async function GET(_request: Request, { params }: { params: Promise<{ owner: string; file: string }> }) {
  const { owner, file } = await params;
  const path = owner + "/" + file;
  if (!isRentalPhotoPath("/api/rentals/photos/" + path)) return new Response(null, { status: 404 });
  const db = await createClient();
  const { data } = await db.storage.from("rental-photos").download(path);
  if (!data) return new Response(null, { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
