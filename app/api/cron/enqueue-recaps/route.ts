import { NextResponse } from "next/server";
import { getImageJobsAdmin } from "@/lib/ai/image-jobs";
import {
  enqueueRecapJob,
  selectAutoRecapCandidates,
  type AutoRecapEventRow,
} from "@/lib/blog/enqueue-recap";

export const maxDuration = 120;

/** Scheduled recovery and refresh. Media completion also enqueues immediately. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getImageJobsAdmin();
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin
      .from("moments")
      .select("event_id")
      .eq("status", "published")
      .in("content_type", ["photo", "image", "video", "audio"])
      .order("id")
      .range(offset, offset + 999);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) if (row.event_id) ids.add(row.event_id);
    if (!data || data.length < 1000) break;
  }
  let enqueued = 0;
  let scanned = 0;
  const skipped: Record<string, number> = {};
  const failures: { eventId: string; error: string }[] = [];
  const eventIds = [...ids];
  for (let i = 0; i < eventIds.length && enqueued < 5; i += 100) {
    const { data, error } = await admin
      .from("events")
      .select(
        "id, status, starts_at, ends_at, has_private_details, tribe_id, tribe_visibility",
      )
      .in("id", eventIds.slice(i, i + 100));
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    for (const event of selectAutoRecapCandidates(
      (data ?? []) as AutoRecapEventRow[],
      new Date(),
    )) {
      const result = await enqueueRecapJob(admin, event.id);
      scanned++;
      if (result.outcome === "enqueued") enqueued++;
      else if (result.outcome === "skipped")
        skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
      else failures.push({ eventId: event.id, error: result.message });
      // Waiting/empty events never consume the enqueue budget and starve ready events.
      if (enqueued >= 5) break;
    }
  }
  if (failures.length) console.error("[enqueue-recaps]", failures);
  return NextResponse.json(
    { scanned, enqueued, skipped, failures },
    { status: failures.length ? 500 : 200 },
  );
}
