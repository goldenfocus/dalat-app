"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { CommentList } from "./comment-list";
import { CommentForm } from "./comment-form";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { CommentWithProfile, CommentTargetType, Locale } from "@/lib/types";

interface ImmersiveCommentsPanelProps {
  /** Target type (event or moment) */
  targetType: CommentTargetType;
  /** Target ID */
  targetId: string;
  /** Content owner ID for moderation */
  contentOwnerId: string;
  /** Current user ID */
  currentUserId?: string;
  /** Initial comment count (for header display) */
  initialCount?: number;
  /** Callback when comment count changes */
  onCountChange?: (count: number) => void;
  /** Optional callback to close panel on mobile */
  onClose?: () => void;
  /** Whether panel is in mobile mode (shows close button) */
  isMobile?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Inline comments panel for immersive view.
 * Designed for desktop side panel but also works as mobile overlay.
 */
export function ImmersiveCommentsPanel({
  targetType,
  targetId,
  contentOwnerId,
  currentUserId,
  initialCount = 0,
  onCountChange,
  onClose,
  isMobile = false,
  className,
}: ImmersiveCommentsPanelProps) {
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
  const [totalCount, setTotalCount] = useState(initialCount);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevTargetIdRef = useRef(targetId);

  const isContentOwner = currentUserId === contentOwnerId;
  const limit = 20;

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

  // Fetch comments
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
          const newTotal = data.total || data.comments.length;
          setTotalCount(newTotal);
          onCountChange?.(newTotal);
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
  }, [targetType, targetId, locale, offset, onCountChange]);

  // Fetch when target changes (user navigates to different moment)
  useEffect(() => {
    if (targetId !== prevTargetIdRef.current) {
      // Reset state for new target
      setComments([]);
      setOffset(0);
      setRepliesMap(new Map());
      setReplyingTo(null);
      setTotalCount(initialCount);
      prevTargetIdRef.current = targetId;
      // Scroll to top
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
    fetchComments(true);
  }, [targetId, initialCount]);

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

  // Submit a new top-level comment with optimistic update
  const handleSubmit = async (content: string) => {
    if (!currentUserId) return;

    // Optimistic update
    const optimisticComment = createOptimisticComment(content);
    setComments((prev) => [optimisticComment, ...prev]);
    setTotalCount((prev) => {
      const newCount = prev + 1;
      onCountChange?.(newCount);
      return newCount;
    });
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

      if (!response.ok || data.error) {
        console.error("[comments] API error:", data.error);
        setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
        setTotalCount((prev) => {
          const newCount = prev - 1;
          onCountChange?.(newCount);
          return newCount;
        });
        return;
      }

      if (data.ok && data.comment) {
        setComments((prev) =>
          prev.map((c) => (c.id === optimisticComment.id ? data.comment : c))
        );
        triggerHaptic("medium");
      }
    } catch (error) {
      console.error("[comments] Error submitting comment:", error);
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
      setTotalCount((prev) => {
        const newCount = prev - 1;
        onCountChange?.(newCount);
        return newCount;
      });
    }
  };

  // Submit a reply with optimistic update
  const handleSubmitReply = async (content: string) => {
    if (!currentUserId || !replyingTo) return;

    const parentId = replyingTo.id;

    // Optimistic update
    const optimisticReply = createOptimisticComment(content, parentId);
    setRepliesMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(parentId) || [];
      next.set(parentId, [...existing, optimisticReply]);
      return next;
    });
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
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId ? { ...c, is_deleted: true, content: "[deleted]" } : c
          )
        );

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
    <div
      className={cn(
        "flex flex-col h-full bg-background/95 backdrop-blur-sm",
        isMobile && "rounded-t-2xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            {t("title")}
            {totalCount > 0 && (
              <span className="ml-2 text-muted-foreground font-normal">
                ({totalCount})
              </span>
            )}
          </h2>
        </div>

        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-full opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">Close</span>
          </button>
        )}
      </div>

      {/* Comments list (scrollable) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
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

      {/* Comment form (sticky at bottom) */}
      {currentUserId && !replyingTo && (
        <div className="flex-shrink-0 border-t p-4 pb-safe bg-background">
          <CommentForm
            onSubmit={handleSubmit}
            disabled={submitting}
            placeholder={t("placeholder")}
            aiContext="a comment on a moment"
          />
        </div>
      )}

      {/* Prompt for anonymous users */}
      {!currentUserId && (
        <div className="flex-shrink-0 border-t p-4 text-center text-sm text-muted-foreground">
          Sign in to comment
        </div>
      )}
    </div>
  );
}
