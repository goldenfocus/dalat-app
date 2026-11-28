import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** The only render kind enqueued today; the queue accepts any `^[a-z][a-z0-9_]{1,40}$`. */
export const RECAP_RENDER_KIND = "recap_short";

const inputSchema = z.object({
  eventId: z.string().uuid(),
  // Opaque here: the spec module owns its shape; the queue stores it as jsonb.
  spec: z.unknown().refine((v) => v !== undefined, "spec required"),
  sourceHash: z.string().min(8).max(128),
  priority: z.number().int().min(-100).max(100).optional(),
});

const rowSchema = z.object({ id: z.string().uuid(), status: z.string() });

export type EnqueueRecapRenderInput = z.input<typeof inputSchema>;
export interface EnqueueRecapRenderResult {
  id: string;
  status: string;
  /** false when the same (event, kind, source hash) was already queued. */
  created: boolean;
}

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Queue a recap render. Idempotent on (event_id, kind, source_hash): the
 * unique constraint is the authority, a duplicate returns the existing row.
 * Does not decide *whether* an event deserves a recap; the caller (a later
 * trigger) owns eligibility.
 */
export async function enqueueRecapRender(
  input: EnqueueRecapRenderInput,
  client: SupabaseClient = adminClient(),
): Promise<EnqueueRecapRenderResult> {
  const { eventId, spec, sourceHash, priority } = inputSchema.parse(input);
  const key = { event_id: eventId, kind: RECAP_RENDER_KIND, source_hash: sourceHash };

  const inserted = await client
    .from("render_jobs")
    .insert({ ...key, spec, priority: priority ?? 0 })
    .select("id, status")
    .single();
  if (!inserted.error) return { ...rowSchema.parse(inserted.data), created: true };
  // 23505 = unique violation: the same inputs are already queued (or rendered).
  if (inserted.error.code !== "23505") {
    throw new Error(`enqueueRecapRender failed: ${inserted.error.message}`);
  }

  const existing = await client
    .from("render_jobs")
    .select("id, status")
    .match(key)
    .single();
  if (existing.error) throw new Error(`enqueueRecapRender lookup failed: ${existing.error.message}`);
  return { ...rowSchema.parse(existing.data), created: false };
}
