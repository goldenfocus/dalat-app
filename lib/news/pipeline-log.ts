/**
 * Persistent pipeline logging for the news/blog content pipeline.
 * Writes to content_pipeline_events (service-role only, no RLS policies).
 * Logging must never break the pipeline — every failure degrades to console.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PipelineEvent {
  runId?: string;
  stage: string;
  postId?: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

let cachedClient: SupabaseClient | null | undefined;

/**
 * Service-role client for pipeline logging.
 * Returns null when service credentials are not configured (never throws).
 */
export function getPipelineLogClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  cachedClient = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey)
    : null;

  return cachedClient;
}

/**
 * Insert a pipeline event. Never throws — logging failures fall back to
 * console.error so they can't take down the pipeline they're observing.
 */
export async function logPipelineEvent(
  supabase: SupabaseClient,
  evt: PipelineEvent
): Promise<void> {
  try {
    const { error } = await supabase.from('content_pipeline_events').insert({
      run_id: evt.runId ?? null,
      stage: evt.stage,
      post_id: evt.postId ?? null,
      level: evt.level,
      message: evt.message,
      meta: evt.meta ?? {},
    });

    if (error) {
      console.error('[pipeline-log] Failed to insert event:', error.message, evt);
    }
  } catch (error) {
    console.error('[pipeline-log] Failed to insert event:', error, evt);
  }
}
