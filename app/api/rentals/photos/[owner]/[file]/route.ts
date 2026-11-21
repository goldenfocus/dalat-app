import { createClient } from "@/lib/supabase/server";
import { isRentalPhotoPath } from "@/lib/rentals/data";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ owner: string; file: string }> }) {
  const { owner, file } = await params;
  const path = owner + "/" + file;
  if (!isRentalPhotoPath("/api/rentals/photos/" + path)) return new Response(null, { status: 404, headers: privateHeaders });
  const db = await createClient();
  const { data } = await db.storage.from("rental-photos").download(path);
  // A photo may still be in a draft or may have just been uploaded.
  if (!data) return new Response(null, { status: 404, headers: privateHeaders });
  return new Response(data, { headers: { ...privateHeaders, "Content-Type": "image/webp" } });
}
