import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectAutoRecapCandidates,
  hasEventEnded,
  prepareRecapInput,
  enqueueRecapJob,
  type AutoRecapEventRow,
} from "./enqueue-recap";

const NOW = new Date("2026-09-03T12:00:00Z");
const event = (over: Partial<AutoRecapEventRow> = {}) => ({
  id: "e1",
  title: "Meetup",
  description: "Planned introductions",
  location_name: "Cafe",
  status: "published",
  starts_at: "2026-09-01T03:00:00Z",
  ends_at: null,
  has_private_details: false,
  tribe_id: null,
  tribe_visibility: null,
  ...over,
});
const moment = (kind = "photo", metadata: Record<string, unknown> = {}) => ({
  id: `m-${kind}`,
  content_type: kind,
  created_at: "2026-09-01T07:00:00Z",
  moment_metadata: {
    processing_status: "completed",
    ai_description: "People gathered around a table",
    video_transcript: kind === "video" ? "Discussion of branding." : null,
    audio_transcript: kind === "audio" ? "A discussion about feedback." : null,
    ...metadata,
  },
});

function database(
  responses: Record<string, Array<{ data: unknown; error?: unknown }>>,
) {
  const writes: { table: string; method: string; value: unknown }[] = [];
  const filters: unknown[][] = [];
  const db = {
    from(table: string) {
      const response = responses[table]?.shift();
      if (!response) throw new Error(`Unexpected query: ${table}`);
      const chain: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "in",
        "order",
        "range",
        "maybeSingle",
        "insert",
        "update",
      ]) {
        chain[method] = (...args: unknown[]) => {
          if (["insert", "update"].includes(method))
            writes.push({ table, method, value: args[0] });
          if (method === "eq") filters.push(args);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: null, ...response }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, writes, filters };
}

describe("automatic event eligibility", () => {
  it("processes both just-finished and old events with new moments", () => {
    expect(
      selectAutoRecapCandidates(
        [
          event({ ends_at: "2026-09-03T11:59:00Z" }),
          event({ starts_at: "2025-01-01T00:00:00Z" }),
        ],
        NOW,
      ),
    ).toHaveLength(2);
  });
  it("uses the same four-hour default as the event page", () => {
    expect(
      hasEventEnded(event({ starts_at: "2026-09-03T09:00:00Z" }), NOW),
    ).toBe(false);
    expect(
      hasEventEnded(event({ starts_at: "2026-09-03T08:00:00Z" }), NOW),
    ).toBe(true);
  });
  it("excludes unfinished, cancelled and private events", () => {
    expect(
      selectAutoRecapCandidates(
        [
          event({ ends_at: "2026-09-04T00:00:00Z" }),
          event({ status: "cancelled" }),
          event({ has_private_details: true }),
          event({ tribe_id: "t1", tribe_visibility: "members_only" }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe("recap evidence readiness", () => {
  it("waits for the last recording instead of publishing a photos-only recap", async () => {
    const { db, writes } = database({
      events: [{ data: event() }],
      moments: [
        { data: [moment(), moment("video", { processing_status: "failed" })] },
      ],
    });
    expect(await prepareRecapInput(db, "e1", NOW)).toMatchObject({
      outcome: "skipped",
      reason: "awaiting_media",
    });
    expect(writes).toEqual([]);
  });
  it("waits for transcription even when legacy video captions are complete", async () => {
    const { db } = database({
      events: [{ data: event() }],
      moments: [{ data: [moment("video", { video_transcript: null })] }],
    });
    expect(await prepareRecapInput(db, "e1", NOW)).toMatchObject({
      reason: "awaiting_media",
    });
  });
  it("accepts a fully analyzed recording without speech and a single photo", async () => {
    const { db } = database({
      events: [{ data: event() }],
      moments: [
        { data: [moment(), moment("video", { video_transcript: "" })] },
      ],
    });
    expect(await prepareRecapInput(db, "e1", NOW)).toMatchObject({
      outcome: "ready",
      stats: { eligibleMoments: 2 },
    });
  });
  it("includes every recording and its entire transcript, beyond the former 50-moment cap", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      ...moment(),
      id: `m${i}`,
    }));
    const { db } = database({
      events: [{ data: event() }],
      moments: [
        { data: rows },
        {
          data: [
            moment("video", {
              video_transcript: `${"recorded topic ".repeat(300)}FINAL TOPIC`,
            }),
            moment("audio"),
          ],
        },
      ],
    });
    const result = await prepareRecapInput(db, "e1", NOW);
    expect(result).toMatchObject({
      outcome: "ready",
      stats: { eligibleMoments: 502 },
    });
    if (result.outcome === "ready")
      expect(result.prompt).toContain("FINAL TOPIC");
  });
  it("does not mistake query failures for an empty gallery", async () => {
    const { db } = database({
      events: [{ data: event() }],
      moments: [{ data: null, error: { message: "database unavailable" } }],
    });
    expect(await prepareRecapInput(db, "e1", NOW)).toMatchObject({
      outcome: "error",
    });
  });
  it("checks privacy before fetching any moment", async () => {
    const { db } = database({
      events: [{ data: event({ has_private_details: true }) }],
    });
    expect(await prepareRecapInput(db, "e1", NOW)).toMatchObject({
      reason: "private",
    });
  });
});

describe("recap queue recovery and concurrency", () => {
  it("never overwrites an active worker, even during forced regeneration", async () => {
    const { db, writes } = database({
      events: [{ data: event() }],
      moments: [{ data: [moment()] }],
      caption_jobs: [
        { data: { id: "active", status: "processing", prompt: "old" } },
      ],
    });
    expect(await enqueueRecapJob(db, "e1", { replace: true })).toMatchObject({
      reason: "already_queued",
    });
    expect(writes).toEqual([]);
  });
  it("refreshes changed evidence with a new identity and compare-and-set update", async () => {
    const { db, writes, filters } = database({
      events: [{ data: event() }],
      moments: [{ data: [moment()] }],
      caption_jobs: [
        { data: { id: "old", status: "done", prompt: "previous photos" } },
        { data: [{ id: "new" }] },
      ],
    });
    expect(await enqueueRecapJob(db, "e1")).toMatchObject({
      outcome: "enqueued",
    });
    expect(writes[0].method).toBe("update");
    expect(writes[0].value).toMatchObject({
      status: "pending",
      retry_rounds: 0,
    });
    expect(filters).toContainEqual(["status", "done"]);
    expect(filters).toContainEqual(["id", "old"]);
  });
});
