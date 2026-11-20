import { createClient as createServiceClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createTusDirectUpload, deleteVideo } from "@/lib/cloudflare-stream";
import { rentalVideoId, rentalVideoMaxBytes } from "@/lib/rentals/video";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const upload = z.object({ size: z.number().int().positive().max(rentalVideoMaxBytes) });

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  const input = upload.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 400 });

  let uid: string | undefined;
  try {
    const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const reservation = await createTusDirectUpload(input.data.size, {
      requireSignedURLs: true,
      thumbnailTimestampPct: 0.1,
      creator: user.id,
    });
    uid = rentalVideoId.parse(reservation.uid);
    const { error } = await admin.from("rental_video_uploads").insert({ uid, host_id: user.id });
    if (error) throw error;
    return Response.json({ uid, uploadUrl: reservation.uploadURL });
  } catch {
    if (uid) await deleteVideo(uid).catch(() => {});
    return new Response(null, { status: 503 });
  }
}
