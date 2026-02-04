import { createClient } from '@/lib/supabase/server';
import type {
  ContentLocale,
  CommentWithProfile,
  CommentCounts,
  CommentTargetType,
} from '@/lib/types';
import { getCachedTranslationsBatch } from '@/lib/cache/server-cache';

// ============================================
// Types
// ============================================

export interface TranslatedComment extends CommentWithProfile {
  translated_content: string;
  is_translated: boolean;
}

export interface CreateCommentResult {
  ok: boolean;
  comment_id?: string;
  is_reply?: boolean;
  content_owner_id?: string;
  parent_author_id?: string | null;
  error?: string;
}

export interface ToggleMuteResult {
  ok: boolean;
  thread_id?: string;
  muted?: boolean;
  error?: string;
}

// ============================================
// Fetching Comments
// ============================================

/**
 * Get paginated top-level comments for a target (event or moment)
 */
export async function getComments(
  targetType: CommentTargetType,
  targetId: string,
  options: {
    limit?: number;
    offset?: number;
    sort?: 'newest' | 'oldest';
  } = {}
): Promise<CommentWithProfile[]> {
  const supabase = await createClient();
  const { limit = 20, offset = 0, sort = 'newest' } = options;

  const { data, error } = await supabase
    .rpc('get_comments', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_limit: limit,
      p_offset: offset,
      p_sort: sort,
    });

  if (error) {
    console.error('[comments] Error fetching comments:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get paginated replies for a thread
 */
export async function getCommentReplies(
  parentId: string,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<CommentWithProfile[]> {
  const supabase = await createClient();
  const { limit = 50, offset = 0 } = options;

  const { data, error } = await supabase
    .rpc('get_comment_replies', {
      p_parent_id: parentId,
      p_limit: limit,
      p_offset: offset,
    });

  if (error) {
    console.error('[comments] Error fetching replies:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get comment count for a target
 */
export async function getCommentCount(
  targetType: CommentTargetType,
  targetId: string
): Promise<CommentCounts | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('get_comment_count', {
      p_target_type: targetType,
      p_target_id: targetId,
    });

  if (error) {
    console.error('[comments] Error fetching count:', error.message);
    return null;
  }

  return data as CommentCounts;
}

/**
 * Get comments with translation support
 * Uses batch translation fetching to avoid N+1 queries
 */
export async function getCommentsWithTranslations(
  targetType: CommentTargetType,
  targetId: string,
  targetLocale: ContentLocale,
  options: {
    limit?: number;
    offset?: number;
    sort?: 'newest' | 'oldest';
  } = {}
): Promise<TranslatedComment[]> {
  const comments = await getComments(targetType, targetId, options);

  if (comments.length === 0) {
    return [];
  }

  // Collect IDs of comments that need translation (not deleted and different locale)
  const commentIdsToTranslate = comments
    .filter((c) => !c.is_deleted && (c.source_locale || 'en') !== targetLocale)
    .map((c) => c.id);

  // Batch fetch all translations in ONE query
  const translationsMap = commentIdsToTranslate.length > 0
    ? await getCachedTranslationsBatch('comment', commentIdsToTranslate, targetLocale)
    : new Map();

  // Map translations back to comments
  return comments.map((comment) => {
    // Skip translation for deleted comments
    if (comment.is_deleted) {
      return {
        ...comment,
        translated_content: comment.content,
        is_translated: false,
      };
    }

    const sourceLocale = (comment.source_locale || 'en') as ContentLocale;

    // If already in target locale, no need to translate
    if (sourceLocale === targetLocale) {
      return {
        ...comment,
        translated_content: comment.content,
        is_translated: false,
      };
    }

    // Get translation from batch result (comments use 'content' field, not 'text_content')
    const translation = translationsMap.get(comment.id);
    const translatedContent = translation?.content || comment.content;
    const isTranslated = translatedContent !== comment.content;

    return {
      ...comment,
      translated_content: translatedContent,
      is_translated: isTranslated,
    };
  });
}

/**
 * Get replies with translation support
 * Uses batch translation fetching to avoid N+1 queries
 */
export async function getRepliesWithTranslations(
  parentId: string,
  targetLocale: ContentLocale,
  options: {
    limit?: number;
    offset?: number;
  } = {}
): Promise<TranslatedComment[]> {
  const replies = await getCommentReplies(parentId, options);

  if (replies.length === 0) {
    return [];
  }

  // Collect IDs of replies that need translation
  const replyIdsToTranslate = replies
    .filter((r) => !r.is_deleted && (r.source_locale || 'en') !== targetLocale)
    .map((r) => r.id);

  // Batch fetch all translations in ONE query
  const translationsMap = replyIdsToTranslate.length > 0
    ? await getCachedTranslationsBatch('comment', replyIdsToTranslate, targetLocale)
    : new Map();

  // Map translations back to replies
  return replies.map((reply) => {
    if (reply.is_deleted) {
      return {
        ...reply,
        translated_content: reply.content,
        is_translated: false,
      };
    }

    const sourceLocale = (reply.source_locale || 'en') as ContentLocale;

    if (sourceLocale === targetLocale) {
      return {
        ...reply,
        translated_content: reply.content,
        is_translated: false,
      };
    }

    // Get translation from batch result (comments use 'content' field, not 'text_content')
    const translation = translationsMap.get(reply.id);
    const translatedContent = translation?.content || reply.content;

    return {
      ...reply,
      translated_content: translatedContent,
      is_translated: translatedContent !== reply.content,
    };
  });
}

// ============================================
// Creating & Editing Comments
// ============================================

/**
 * Create a new comment or reply
 */
export async function createComment(
  targetType: CommentTargetType,
  targetId: string,
  content: string,
  options: {
    parentId?: string;
    sourceLocale?: string;
  } = {}
): Promise<CreateCommentResult> {
  const supabase = await createClient();
  const { parentId, sourceLocale = 'en' } = options;

  const { data, error } = await supabase
    .rpc('create_comment', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_content: content,
      p_parent_id: parentId || null,
      p_source_locale: sourceLocale,
    });

  if (error) {
    console.error('[comments] Error creating comment:', error.message);
    return { ok: false, error: error.message };
  }

  return data as CreateCommentResult;
}

/**
 * Edit a comment
 */
export async function editComment(
  commentId: string,
  content: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('edit_comment', {
      p_comment_id: commentId,
      p_content: content,
    });

  if (error) {
    console.error('[comments] Error editing comment:', error.message);
    return { ok: false, error: error.message };
  }

  return data as { ok: boolean };
}

/**
 * Delete a comment (soft delete)
 */
export async function deleteComment(
  commentId: string
): Promise<{ ok: boolean; deleted_by_owner?: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('delete_comment', {
      p_comment_id: commentId,
    });

  if (error) {
    console.error('[comments] Error deleting comment:', error.message);
    return { ok: false, error: error.message };
  }

  return data as { ok: boolean; deleted_by_owner: boolean };
}

// ============================================
// Moderation
// ============================================

/**
 * Hide or unhide a comment (moderation)
 */
export async function moderateComment(
  commentId: string,
  hide: boolean,
  note?: string
): Promise<{ ok: boolean; is_hidden?: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('moderate_comment', {
      p_comment_id: commentId,
      p_hide: hide,
      p_note: note || null,
    });

  if (error) {
    console.error('[comments] Error moderating comment:', error.message);
    return { ok: false, error: error.message };
  }

  return data as { ok: boolean; is_hidden: boolean };
}

// ============================================
// Thread Muting
// ============================================

/**
 * Toggle mute on a thread
 */
export async function toggleMuteThread(
  threadId: string
): Promise<ToggleMuteResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('toggle_mute_thread', {
      p_thread_id: threadId,
    });

  if (error) {
    console.error('[comments] Error toggling mute:', error.message);
    return { ok: false, error: error.message };
  }

  return data as ToggleMuteResult;
}

/**
 * Check if a thread is muted by current user
 */
export async function isThreadMuted(threadId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .rpc('is_thread_muted', {
      p_thread_id: threadId,
    });

  if (error) {
    console.error('[comments] Error checking mute status:', error.message);
    return false;
  }

  return data as boolean;
}

// ============================================
// Batch Operations
// ============================================

/**
 * Get comment counts for multiple targets at once (optimized single query)
 * Groups targets by type and executes one query per type for efficiency
 */
export async function getCommentCountsBatch(
  targets: Array<{ type: CommentTargetType; id: string }>
): Promise<Map<string, CommentCounts>> {
  const results = new Map<string, CommentCounts>();

  if (targets.length === 0) {
    return results;
  }

  const supabase = await createClient();

  // Group targets by type
  const byType = new Map<CommentTargetType, string[]>();
  for (const { type, id } of targets) {
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(id);
  }

  // Fetch counts for each type using optimized batch RPC
  const queries = Array.from(byType.entries()).map(async ([type, ids]) => {
    const { data, error } = await supabase.rpc('get_comment_counts_batch', {
      p_target_type: type,
      p_target_ids: ids,
    });

    if (error) {
      console.error('[comments] Error fetching batch counts:', error.message);
      return [];
    }

    return (data || []).map((row: { target_id: string; total_count: number; top_level_count: number }) => ({
      key: `${type}:${row.target_id}`,
      counts: {
        target_type: type,
        target_id: row.target_id,
        total_count: row.total_count,
        top_level_count: row.top_level_count,
      } as CommentCounts,
    }));
  });

  const allResults = await Promise.all(queries);

  for (const typeResults of allResults) {
    for (const { key, counts } of typeResults) {
      results.set(key, counts);
    }
  }

  return results;
}

/**
 * Get comment counts for multiple moments (simplified API for grid views)
 * Returns a map of moment ID -> total count (not including reply breakdown)
 */
export async function getMomentCommentCounts(
  momentIds: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  if (momentIds.length === 0) {
    return results;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_comment_counts_batch', {
    p_target_type: 'moment',
    p_target_ids: momentIds,
  });

  if (error) {
    console.error('[comments] Error fetching moment counts:', error.message);
    return results;
  }

  for (const row of data || []) {
    results.set(row.target_id, row.total_count);
  }

  return results;
}

/**
 * Get content owner for notification purposes
 */
export async function getContentOwner(
  targetType: CommentTargetType,
  targetId: string
): Promise<{ ownerId: string; title: string; slug: string } | null> {
  const supabase = await createClient();

  if (targetType === 'event') {
    const { data: event } = await supabase
      .from('events')
      .select('created_by, title, slug')
      .eq('id', targetId)
      .single();

    if (event) {
      return {
        ownerId: event.created_by,
        title: event.title,
        slug: event.slug,
      };
    }
  } else if (targetType === 'moment') {
    // Use explicit FK hint to disambiguate from events.cover_moment_id relationship
    const { data: moment } = await supabase
      .from('moments')
      .select('user_id, events!moments_event_id_fkey(slug, title)')
      .eq('id', targetId)
      .single();

    if (moment) {
      const event = moment.events as unknown as { slug: string; title: string };
      return {
        ownerId: moment.user_id,
        title: event.title,
        slug: event.slug,
      };
    }
  }

  return null;
}
