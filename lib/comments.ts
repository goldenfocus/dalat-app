import { createClient } from '@/lib/supabase/server';
import type {
  ContentLocale,
  CommentWithProfile,
  CommentCounts,
  CommentTargetType,
} from '@/lib/types';
import { getTranslationsWithFallback } from '@/lib/translations';

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

  // Fetch translations for all comments
  const translatedComments = await Promise.all(
    comments.map(async (comment) => {
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

      // Try to get translation
      const translations = await getTranslationsWithFallback(
        'comment',
        comment.id,
        targetLocale,
        {
          text_content: comment.content,
          title: null,
          description: null,
          bio: null,
          story_content: null,
          technical_content: null,
          meta_description: null,
        }
      );

      const translatedContent = translations.text_content || comment.content;
      const isTranslated = translatedContent !== comment.content;

      return {
        ...comment,
        translated_content: translatedContent,
        is_translated: isTranslated,
      };
    })
  );

  return translatedComments;
}

/**
 * Get replies with translation support
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

  // Fetch translations for all replies
  const translatedReplies = await Promise.all(
    replies.map(async (reply) => {
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

      const translations = await getTranslationsWithFallback(
        'comment',
        reply.id,
        targetLocale,
        {
          text_content: reply.content,
          title: null,
          description: null,
          bio: null,
          story_content: null,
          technical_content: null,
          meta_description: null,
        }
      );

      const translatedContent = translations.text_content || reply.content;

      return {
        ...reply,
        translated_content: translatedContent,
        is_translated: translatedContent !== reply.content,
      };
    })
  );

  return translatedReplies;
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
 * Get comment counts for multiple targets at once
 */
export async function getCommentCountsBatch(
  targets: Array<{ type: CommentTargetType; id: string }>
): Promise<Map<string, CommentCounts>> {
  const results = new Map<string, CommentCounts>();

  // Fetch counts in parallel
  const counts = await Promise.all(
    targets.map(async ({ type, id }) => {
      const count = await getCommentCount(type, id);
      return { key: `${type}:${id}`, count };
    })
  );

  for (const { key, count } of counts) {
    if (count) {
      results.set(key, count);
    }
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
    const { data: moment } = await supabase
      .from('moments')
      .select('user_id, events!inner(slug, title)')
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
