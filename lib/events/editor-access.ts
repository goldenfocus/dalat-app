import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** The same scoped authorization used by RLS for every full-editor write. */
export async function canEditEvent(db: Client, eventId: string): Promise<boolean> {
  const { data, error } = await db.rpc("can_edit_event", { p_event_id: eventId });
  if (error) throw error;
  return data === true;
}

export async function canEditSeries(db: Client, seriesId: string): Promise<boolean> {
  const { data, error } = await db.rpc("can_edit_series", { p_series_id: seriesId });
  if (error) throw error;
  return data === true;
}
