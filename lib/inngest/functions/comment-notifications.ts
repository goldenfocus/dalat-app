import { inngest } from '../client';
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

/**
 * Create a service role Supabase client.
 */
function createServiceClient(): AnySupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/**
 * Get user's locale preference
 */
async function getUserLocale(supabase: AnySupabaseClient, userId: string): Promise<Locale> {
  const { data } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', userId)
    .single();
  return ((data as { locale?: string } | null)?.locale as Locale) || 'en';
}

/**
 * Get user's display name
 */
async function getUserDisplayName(supabase: AnySupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', userId)
    .single();
  const profile = data as { display_name?: string; username?: string } | null;
  return profile?.display_name || profile?.username || 'Someone';
}

/**
 * Check if user has muted a thread
 */
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

/**
 * Get comment preview (first 100 chars)
 */
function getCommentPreview(content: string): string {
  if (content.length <= 100) return content;
  return content.slice(0, 97) + '...';
}

/**
 * Event data for comment/created
 */
interface CommentCreatedEventData {
  commentId: string;
  contentType: CommentTargetType;
  contentId: string;
  contentOwnerId: string;
  contentTitle: string;
  eventSlug: string;
  commentAuthorId: string;
  commentContent: string;
  parentCommentId?: string;
  parentCommentAuthorId?: string;
}

/**
 * Handle comment created event - send notifications.
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
export const onCommentCreated = inngest.createFunction(
  {
    id: 'on-comment-created',
    name: 'Process Comment Notifications',
  },
  { event: 'comment/created' },
  async ({ event, step }) => {
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
    } = event.data as CommentCreatedEventData;

    const supabase = createServiceClient();
    if (!supabase) {
      console.error('[comment-notifications] Supabase client not configured');
      return { error: 'Supabase client not configured' };
    }

    const notified = new Set<string>();
    const commentPreview = getCommentPreview(commentContent);
    const commentAuthorName = await step.run('get-commenter-name', () =>
      getUserDisplayName(supabase, commentAuthorId)
    );

    // 1. If this is a reply, notify the parent comment author
    if (parentCommentId && parentCommentAuthorId && parentCommentAuthorId !== commentAuthorId) {
      const shouldNotify = await step.run('check-parent-author-notify', async () => {
        // Check if thread is muted
        const muted = await isThreadMuted(supabase, parentCommentAuthorId, parentCommentId);
        return !muted;
      });

      if (shouldNotify) {
        await step.run('notify-parent-author', async () => {
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

          await notify(payload);
          console.log(`[comment-notifications] Notified parent author ${parentCommentAuthorId} of reply`);
        });
        notified.add(parentCommentAuthorId);
      }
    }

    // 2. Notify content owner if not already notified and not the commenter
    if (contentOwnerId !== commentAuthorId && !notified.has(contentOwnerId)) {
      // Check if this is a direct comment or thread activity
      const isDirectComment = !parentCommentId;

      // For replies, check if thread is muted by content owner
      if (!isDirectComment && parentCommentId) {
        const ownerMuted = await step.run('check-owner-muted', () =>
          isThreadMuted(supabase, contentOwnerId, parentCommentId)
        );
        if (ownerMuted) {
          console.log(`[comment-notifications] Content owner ${contentOwnerId} has muted thread`);
          return { notified: Array.from(notified) };
        }
      }

      await step.run('notify-content-owner', async () => {
        const locale = await getUserLocale(supabase, contentOwnerId);

        if (contentType === 'event') {
          if (isDirectComment) {
            // Direct comment on event
            const payload: CommentOnEventPayload = {
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
            await notify(payload);
          } else {
            // Thread activity on event
            const payload: ThreadActivityPayload = {
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
            await notify(payload);
          }
        } else {
          // Moment
          if (isDirectComment) {
            const payload: CommentOnMomentPayload = {
              type: 'comment_on_moment',
              userId: contentOwnerId,
              locale,
              momentId: contentId,
              eventSlug,
              commenterName: commentAuthorName,
              commentPreview,
            };
            await notify(payload);
          } else {
            const payload: ThreadActivityPayload = {
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
            await notify(payload);
          }
        }
        console.log(`[comment-notifications] Notified content owner ${contentOwnerId}`);
      });
      notified.add(contentOwnerId);
    }

    return { notified: Array.from(notified) };
  }
);
