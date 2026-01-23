"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { triggerHaptic } from "@/lib/haptics";
import type { CommentWithProfile, CommentTargetType, Locale } from "@/lib/types";

interface CommentsSectionProps {
  /** Target type (event or moment) */
  targetType: CommentTargetType;
  /** Target ID */
  targetId: string;
  /** Content owner ID for moderation */
  contentOwnerId: string;
  /** Current user ID */
  currentUserId?: string;
}

/**
 * Inline comments section for detail pages.
 * Shows comments directly on the page (not in a sheet).
 */
export function CommentsSection({
  targetType,
  targetId,
  contentOwnerId,
  currentUserId,
}: CommentsSectionProps) {
  const t = useTranslations("comments");
  const locale = useLocale() as Locale;

  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<CommentWithProfile | null>(null);
  const [repliesMap, setRepliesMap] = useState<Map<string, CommentWithProfile[]>>(new Map());
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const isContentOwner = currentUserId === contentOwnerId;
  const limit = 20;

  // Fetch comments on mount
  const fetchComments = useCallback(async (reset = false) => {
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
          setTotalCount(data.total || data.comments.length);
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
  }, [targetType, targetId, locale, offset]);

  useEffect(() => {
    fetchComments(true);
  }, [targetType, targetId]);

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
          setTotalCount((prev) => prev + 1);
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
    <div className="mt-8 border-t pt-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">
          {t("title")}
          {totalCount > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">
              ({totalCount})
            </span>
          )}
        </h2>
      </div>

      {/* Comment form at top for new comments (not replies) */}
      {currentUserId && !replyingTo && (
        <div className="mb-6">
          <CommentForm
            onSubmit={handleSubmit}
            disabled={submitting}
            aiContext={`a comment on ${targetType === "event" ? "an event" : "a moment"}`}
          />
        </div>
      )}

      {/* Comments list */}
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
        onSubmitReply={handleSubmit}
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
  );
}
