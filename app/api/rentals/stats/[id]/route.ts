import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readPeopleBody } from "@/lib/people/http";
import { rentalId } from "@/lib/rentals/data";
import { rentalStatsCounts } from "@/lib/rentals/stats";

type Context = { params: Promise<{ id: string }> };
const payload = z.object({ session: z.uuid(), media: z.string().min(1).max(180).nullable() }).strict();
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const empty = (status: number) => new Response(null, { status, headers });

function statsDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function GET(_request: Request, { params }: Context) {
  const listing = rentalId.safeParse((await params).id);
  if (!listing.success) return empty(404);
  const db = statsDb();
  if (!db) return empty(503);

  const { data, error } = await db.rpc("rental_stats_visible", { listing: listing.data });
  if (error) return empty(503);
  if (data === null) return empty(404);
  const counts = rentalStatsCounts.safeParse(data);
  return counts.success ? Response.json(counts.data, { headers }) : empty(503);
}

export async function POST(request: Request, { params }: Context) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return empty(403);
  const listing = rentalId.safeParse((await params).id);
  if (!listing.success) return empty(404);
  const input = payload.safeParse(await readPeopleBody(request));
  if (!input.success) return empty(400);
  const db = statsDb();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!db || !key) return empty(503);

  // Only Vercel's own proxy header supplies the IP in production. The database
  // receives an expiring HMAC bucket, never the raw address or browser token.
  const address = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") || "unknown" : "local";
  const digest = (value: string) => createHmac("sha256", key).update(value).digest("hex");
  const minuteBucket = Math.floor(Date.now() / 600_000);
  const { data, error } = await db.rpc("rental_stats_record", {
    listing: listing.data,
    visitor: digest(`rental-session:${listing.data}:${input.data.session}`),
    rate_bucket: digest(`rental-rate:${minuteBucket}:${address}`),
    media_src: input.data.media,
  });
  if (error) return empty(503);
  if (data === null) return empty(404);
  if (data?.limited) return empty(429);
  if (data?.ok && input.data.media) return empty(204);
  const counts = rentalStatsCounts.safeParse(data);
  return counts.success ? Response.json(counts.data, { headers }) : empty(503);
}
