import { unstable_cache } from "next/cache";
import { getVideoAccessToken, getVideoDetails, getVideoThumbnailUrl, getVODPlaybackUrl } from "@/lib/cloudflare-stream";
import { rentalVideoId } from "@/lib/rentals/video";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store" };
const signVideo = unstable_cache((uid: string) => getVideoAccessToken(uid, 900), ["rental-video-token"], { revalidate: 240 });

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const id = rentalVideoId.safeParse((await params).uid);
  if (!id.success) return new Response(null, { status: 404, headers: privateHeaders });

  const db = await createClient();
  const listing = await db.from("rental_listings").select("id").contains("videos", [id.data]).limit(1).maybeSingle();
  if (!listing.data) {
    // RLS allows the owning host to preview a clip before saving a listing.
    const upload = await db.from("rental_video_uploads").select("uid").eq("uid", id.data).maybeSingle();
    if (!upload.data) return new Response(null, { status: 404, headers: privateHeaders });
  }

  try {
    if (new URL(request.url).searchParams.has("poster")) {
      const token = await signVideo(id.data);
      return new Response(null, { status: 307, headers: {
        ...privateHeaders, Location: getVideoThumbnailUrl(token, { width: 320 }),
      } });
    }

    const video = await getVideoDetails(id.data);
    if (video.status.state === "error") return new Response(null, { status: 422, headers: privateHeaders });
    if (!video.readyToStream) return new Response(null, { status: 202, headers: privateHeaders });
    const token = await signVideo(id.data);
    return Response.json({ src: getVODPlaybackUrl(token) }, { headers: privateHeaders });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
