import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getBlogTranslationCutoff } from './article-policy';

export type BlogTranslationCutoffs = ReadonlyMap<string, string | null>;

interface BlogRevisionRow {
  id: string;
  source: string;
  source_urls: unknown;
  updated_at: string | null;
}

/**
 * Load revision metadata from the live blog rows rather than list RPC
 * snapshots, which omit updated_at. null means the lookup itself failed and
 * callers must render original text only. Missing IDs are intentionally absent
 * from the map so batch translation readers reject them individually.
 */
export async function loadBlogTranslationCutoffs(
  postIds: string[]
): Promise<BlogTranslationCutoffs | null> {
  const uniqueIds = [...new Set(postIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[translation-freshness] Supabase service metadata client is not configured');
    return null;
  }

  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('blog_posts')
    .select('id, source, source_urls, updated_at')
    .in('id', uniqueIds);

  if (error) {
    console.error('[translation-freshness] Failed to load current blog revisions:', error);
    return null;
  }

  const cutoffs = new Map<string, string | null>();
  for (const row of (data ?? []) as BlogRevisionRow[]) {
    const cutoff = getBlogTranslationCutoff(row);
    // A current row without a usable revision cannot authorize translations.
    if (!cutoff) continue;
    cutoffs.set(row.id, cutoff);
  }
  return cutoffs;
}
