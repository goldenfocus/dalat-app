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
import { inngest } from "@/lib/inngest/client";
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

  // Submit a new comment
  const handleSubmit = async (content: string) => {
    if (!currentUserId) return;

    setSubmitting(true);
    triggerHaptic("selection");

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          content,
          parentId: replyingTo?.id,
          sourceLocale: locale,
        }),
      });

      const data = await response.json();

      if (data.ok && data.comment) {
        if (replyingTo) {
          // Add to replies map
          setRepliesMap((prev) => {
            const next = new Map(prev);
            const existing = next.get(replyingTo.id) || [];
            next.set(replyingTo.id, [...existing, data.comment]);
            return next;
          });
          // Update reply count on parent
          setComments((prev) =>
            prev.map((c) =>
              c.id === replyingTo.id
                ? { ...c, reply_count: c.reply_count + 1 }
                : c
            )
          );
        } else {
          // Add to top of comments list
          setComments((prev) => [data.comment, ...prev]);
          onCountChange?.((initialCount || 0) + 1);
        }

        setReplyingTo(null);
        triggerHaptic("medium");
      }
    } catch (error) {
      console.error("[comments] Error submitting comment:", error);
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
              onReply={(comment) => {
                triggerHaptic("selection");
                setReplyingTo(comment);
              }}
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

          {/* Comment form (sticky at bottom) */}
          {currentUserId && (
            <div className="flex-shrink-0 border-t p-4 pb-safe">
              <CommentForm
                onSubmit={handleSubmit}
                replyingTo={
                  replyingTo
                    ? {
                        id: replyingTo.id,
                        name: replyingTo.display_name || replyingTo.username || "Anonymous",
                      }
                    : undefined
                }
                onCancelReply={() => setReplyingTo(null)}
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
