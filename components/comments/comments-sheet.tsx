"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { triggerHaptic } from "@/lib/haptics";
import type { CommentWithProfile, CommentTargetType, Locale } from "@/lib/types";

interface CommentsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target type (event or moment) */
  targetType: CommentTargetType;
  /** Target ID */
  targetId: string;
  /** Event slug for navigation */
  eventSlug: string;
  /** Content title (event title or moment preview) */
  contentTitle: string;
  /** Content owner ID for moderation */
  contentOwnerId: string;
  /** Current user ID */
  currentUserId?: string;
  /** Initial comment count */
  initialCount?: number;
  /** Callback when comment count changes */
  onCountChange?: (count: number) => void;
}

/**
 * Bottom sheet for viewing and adding comments.
 * Includes threaded replies and moderation support.
 */
export function CommentsSheet({
  open,
  onOpenChange,
  targetType,
  targetId,
  eventSlug,
  contentTitle,
  contentOwnerId,
  currentUserId,
  initialCount = 0,
  onCountChange,
}: CommentsSheetProps) {
  // Note: eventSlug and contentTitle are passed for API compatibility but not currently used
  void eventSlug;
  void contentTitle;

  const t = useTranslations("comments");
  const locale = useLocale() as Locale;

  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommentWithProfile | null>(null);
  const [repliesMap, setRepliesMap] = useState<Map<string, CommentWithProfile[]>>(new Map());
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const isContentOwner = currentUserId === contentOwnerId;
  const limit = 20;

  // Fetch comments when sheet opens
  const fetchComments = useCallback(async (reset = false) => {
    if (!open) return;

    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const response = await fetch(
        `/api/comments?targetType=${targetType}&targetId=${targetId}&limit=${limit}&offset=${currentOffset}&locale=${locale}`
      );
      const data = await response.json();

      if (data.comments) {
        if (reset) {
          setComments(data.comments);
          setOffset(data.comments.length);
        } else {
          setComments((prev) => [...prev, ...data.comments]);
          setOffset((prev) => prev + data.comments.length);
        }
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("[comments] Error fetching comments:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [open, targetType, targetId, locale, offset]);

  useEffect(() => {
    if (open) {
      fetchComments(true);
    } else {
      // Reset state when closing
      setComments([]);
      setOffset(0);
      setRepliesMap(new Map());
      setReplyingTo(null);
    }
  }, [open, targetType, targetId]);

  // Load replies for a comment
  const handleLoadReplies = async (parentId: string): Promise<CommentWithProfile[]> => {
    if (loadingReplies.has(parentId)) return [];

    setLoadingReplies((prev) => new Set(prev).add(parentId));

    try {
      const response = await fetch(
        `/api/comments/replies?parentId=${parentId}&locale=${locale}`
      );
      const data = await response.json();

      if (data.replies) {
        setRepliesMap((prev) => {
          const next = new Map(prev);
          next.set(parentId, data.replies);
          return next;
        });
        return data.replies;
      }
      return [];
    } catch (error) {
      console.error("[comments] Error loading replies:", error);
      return [];
    } finally {
      setLoadingReplies((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
  };

  // Create an optimistic comment for instant UI feedback
  const createOptimisticComment = (content: string, parentId?: string): CommentWithProfile => {
    const tempId = `temp-${Date.now()}`;
    return {
      id: tempId,
      user_id: currentUserId!,
      content,
      parent_id: parentId || null,
      is_edited: false,
      is_deleted: false,
      edited_at: null,
      source_locale: locale,
      created_at: new Date().toISOString(),
      reply_count: 0,
      username: null,
      display_name: null,
      avatar_url: null,
    };
  };

  // Submit a new top-level comment with optimistic update
  const handleSubmit = async (content: string) => {
    if (!currentUserId) return;

    // Optimistic update - add comment immediately
    const optimisticComment = createOptimisticComment(content);
    setComments((prev) => [optimisticComment, ...prev]);
    onCountChange?.((initialCount || 0) + 1);
    triggerHaptic("selection");

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          content,
          sourceLocale: locale,
        }),
      });

      const data = await response.json();

      // Handle API errors - remove optimistic comment
      if (!response.ok || data.error) {
        console.error("[comments] API error:", data.error);
        setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
        onCountChange?.(initialCount || 0);
        return;
      }

      if (data.ok && data.comment) {
        // Replace optimistic comment with real comment
        setComments((prev) =>
          prev.map((c) => (c.id === optimisticComment.id ? data.comment : c))
        );
        triggerHaptic("medium");
      }
    } catch (error) {
      console.error("[comments] Error submitting comment:", error);
      // Remove optimistic comment on error
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
      onCountChange?.(initialCount || 0);
    }
  };

  // Submit a reply with optimistic update (inline reply)
  const handleSubmitReply = async (content: string) => {
    if (!currentUserId || !replyingTo) return;

    const parentId = replyingTo.id;

    // Optimistic update - add reply immediately
    const optimisticReply = createOptimisticComment(content, parentId);
    setRepliesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(parentId) || [];
      next.set(parentId, [...existing, optimisticReply]);
      return next;
    });
    // Update reply count immediately
    setComments((prev) =>
      prev.map((c) =>
        c.id === parentId ? { ...c, reply_count: c.reply_count + 1 } : c
      )
    );
    setReplyingTo(null);
    triggerHaptic("selection");
    setSubmitting(true);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          content,
          parentId,
          sourceLocale: locale,
        }),
      });

      const data = await response.json();

      // Handle API errors - remove optimistic reply
      if (!response.ok || data.error) {
        console.error("[comments] API error:", data.error);
        setRepliesMap((prev) => {
          const next = new Map(prev);
          const replies = next.get(parentId) || [];
          next.set(parentId, replies.filter((r) => r.id !== optimisticReply.id));
          return next;
        });
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId ? { ...c, reply_count: c.reply_count - 1 } : c
          )
        );
        return;
      }

      if (data.ok && data.comment) {
        // Replace optimistic reply with real reply
        setRepliesMap((prev) => {
          const next = new Map(prev);
          const replies = next.get(parentId) || [];
          next.set(
            parentId,
            replies.map((r) => (r.id === optimisticReply.id ? data.comment : r))
          );
          return next;
        });
        triggerHaptic("medium");
      }
    } catch (error) {
      console.error("[comments] Error submitting reply:", error);
      // Remove optimistic reply on error
      setRepliesMap((prev) => {
        const next = new Map(prev);
        const replies = next.get(parentId) || [];
        next.set(parentId, replies.filter((r) => r.id !== optimisticReply.id));
        return next;
      });
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId ? { ...c, reply_count: c.reply_count - 1 } : c
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete a comment
  const handleDelete = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Mark as deleted in UI
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, is_deleted: true, content: "[deleted]" } : c
          )
        );

        // Also check replies
        setRepliesMap((prev) => {
          const next = new Map(prev);
          for (const [parentId, replies] of next) {
            next.set(
              parentId,
              replies.map((r) =>
                r.id === commentId ? { ...r, is_deleted: true, content: "[deleted]" } : r
              )
            );
          }
          return next;
        });

        triggerHaptic("medium");
      }
    } catch (error) {
      console.error("[comments] Error deleting comment:", error);
    }
  };

  // Mute a thread
  const handleMuteThread = async (threadId: string) => {
    try {
      await fetch("/api/comments/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      });
      triggerHaptic("selection");
    } catch (error) {
      console.error("[comments] Error muting thread:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Content
          className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-2xl max-h-[85vh] flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
          aria-describedby={undefined}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-3 border-b flex-shrink-0">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {t("title")}
              {initialCount > 0 && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ({initialCount})
                </span>
              )}
            </DialogPrimitive.Title>

            <DialogPrimitive.Close className="p-2 -m-2 rounded-full opacity-70 hover:opacity-100 transition-opacity">
              <X className="w-5 h-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Comments list (scrollable) */}
          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
            <CommentList
              comments={comments}
              loading={loading}
              currentUserId={currentUserId}
              isContentOwner={isContentOwner}
              replyingToId={replyingTo?.id}
              isSubmittingReply={submitting}
              onReply={(comment) => {
                triggerHaptic("selection");
                setReplyingTo(comment);
              }}
              onSubmitReply={handleSubmitReply}
              onCancelReply={() => setReplyingTo(null)}
              onDelete={handleDelete}
              onMuteThread={handleMuteThread}
              onLoadReplies={handleLoadReplies}
              repliesMap={repliesMap}
              loadingReplies={loadingReplies}
              hasMore={hasMore}
              onLoadMore={() => fetchComments(false)}
              loadingMore={loadingMore}
            />
          </div>

          {/* Comment form (sticky at bottom) - only for top-level comments */}
          {currentUserId && !replyingTo && (
            <div className="flex-shrink-0 border-t p-4 pb-safe">
              <CommentForm
                onSubmit={handleSubmit}
                disabled={submitting}
                aiContext={`a comment on ${targetType === "event" ? "an event" : "a moment"}`}
              />
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
