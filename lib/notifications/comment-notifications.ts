import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { notify } from '@/lib/notifications';
import type {
  CommentOnEventPayload,
  CommentOnMomentPayload,
  ReplyToCommentPayload,
  ThreadActivityPayload,
  CommentTargetType,
} from '@/lib/notifications/types';
import type { Locale } from '@/lib/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

function createServiceClient(): AnySupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

async function getUserLocale(supabase: AnySupabaseClient, userId: string): Promise<Locale> {
  const { data } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', userId)
    .single();
  return ((data as { locale?: string } | null)?.locale as Locale) || 'en';
}

async function getUserDisplayName(supabase: AnySupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .single();
  const profile = data as { display_name?: string; username?: string } | null;
  return profile?.display_name || profile?.username || 'Someone';
}

async function isThreadMuted(
  supabase: AnySupabaseClient,
  userId: string,
  threadId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('muted_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .single();
  return !!data;
}

function getCommentPreview(content: string): string {
  if (content.length <= 100) return content;
  return content.slice(0, 97) + '...';
}

export interface CommentCreatedData {
  commentId: string;
  contentType: CommentTargetType;
  contentId: string;
  contentOwnerId: string;
  contentTitle: string;
  eventSlug: string;
  commentAuthorId: string;
  commentContent: string;
  parentCommentId?: string | null;
  parentCommentAuthorId?: string | null;
}

/**
 * Send notifications for a newly created comment.
 *
 * Notification rules:
 * 1. If direct comment: notify content owner (event/moment owner)
 * 2. If reply: notify parent comment author
 * 3. If reply by someone other than content owner: notify content owner of thread activity
 *
 * Never notify:
 * - Yourself
 * - The same person twice for the same action
 * - Users who have muted the thread
 */
export async function sendCommentNotifications(
  data: CommentCreatedData
): Promise<{ notified: string[] }> {
  const {
    commentId,
    contentType,
    contentId,
    contentOwnerId,
    contentTitle,
    eventSlug,
    commentAuthorId,
    commentContent,
    parentCommentId,
    parentCommentAuthorId,
  } = data;

  const supabase = createServiceClient();
  if (!supabase) throw new Error('Supabase service client not configured');

  const notified = new Set<string>();
  const commentPreview = getCommentPreview(commentContent);
  const commentAuthorName = await getUserDisplayName(supabase, commentAuthorId);

  // 1. If this is a reply, notify the parent comment author
  if (parentCommentId && parentCommentAuthorId && parentCommentAuthorId !== commentAuthorId) {
    const muted = await isThreadMuted(supabase, parentCommentAuthorId, parentCommentId);

    if (!muted) {
      const locale = await getUserLocale(supabase, parentCommentAuthorId);

      const payload: ReplyToCommentPayload = {
        type: 'reply_to_comment',
        userId: parentCommentAuthorId,
        locale,
        contentType,
        contentId,
        eventSlug,
        commentId,
        parentCommentId,
        replierName: commentAuthorName,
        commentPreview,
      };

      const result = await notify(payload);
      if (result.success) {
        console.log(`[comment-notifications] Notified parent author ${parentCommentAuthorId} of reply`);
        notified.add(parentCommentAuthorId);
      } else {
        console.error(`[comment-notifications] FAILED to notify parent author ${parentCommentAuthorId} (comment ${commentId})`);
      }
    }
  }

  // 2. Notify content owner if not already notified and not the commenter
  if (contentOwnerId !== commentAuthorId && !notified.has(contentOwnerId)) {
    // Check if this is a direct comment or thread activity
    const isDirectComment = !parentCommentId;

    // For replies, check if thread is muted by content owner
    if (!isDirectComment && parentCommentId) {
      const ownerMuted = await isThreadMuted(supabase, contentOwnerId, parentCommentId);
      if (ownerMuted) {
        console.log(`[comment-notifications] Content owner ${contentOwnerId} has muted thread`);
        return { notified: Array.from(notified) };
      }
    }

    const locale = await getUserLocale(supabase, contentOwnerId);

    let payload:
      | CommentOnEventPayload
      | CommentOnMomentPayload
      | ThreadActivityPayload;

    if (contentType === 'event') {
      if (isDirectComment) {
        // Direct comment on event
        payload = {
          type: 'comment_on_event',
          userId: contentOwnerId,
          locale,
          eventId: contentId,
          eventSlug,
          eventTitle: contentTitle,
          commentId,
          commenterName: commentAuthorName,
          commentPreview,
        };
      } else {
        // Thread activity on event
        payload = {
          type: 'thread_activity',
          userId: contentOwnerId,
          locale,
          contentType: 'event',
          contentId,
          eventSlug,
          contentTitle,
          threadId: parentCommentId!,
          activityCount: 1,
        };
      }
    } else {
      // Moment
      if (isDirectComment) {
        payload = {
          type: 'comment_on_moment',
          userId: contentOwnerId,
          locale,
          momentId: contentId,
          eventSlug,
          commenterName: commentAuthorName,
          commentPreview,
        };
      } else {
        payload = {
          type: 'thread_activity',
          userId: contentOwnerId,
          locale,
          contentType: 'moment',
          contentId,
          eventSlug,
          contentTitle,
          threadId: parentCommentId!,
          activityCount: 1,
        };
      }
    }

    const result = await notify(payload);
    if (result.success) {
      console.log(`[comment-notifications] Notified content owner ${contentOwnerId}`);
      notified.add(contentOwnerId);
    } else {
      console.error(`[comment-notifications] FAILED to notify content owner ${contentOwnerId} (comment ${commentId})`);
    }
  }

  return { notified: Array.from(notified) };
}
