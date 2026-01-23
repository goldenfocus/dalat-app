"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, MoreHorizontal, Trash2, Pencil, BellOff, ChevronDown, ChevronUp, X, Send, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { triggerHaptic } from "@/lib/haptics";
import type { CommentWithProfile } from "@/lib/types";

interface CommentItemProps {
  comment: CommentWithProfile;
  /** Current user's ID for showing edit/delete options */
  currentUserId?: string;
  /** Whether this comment is by the content owner */
  isContentOwner?: boolean;
  /** Whether this comment is currently being replied to */
  isReplying?: boolean;
  /** Whether the reply is being submitted */
  isSubmittingReply?: boolean;
  /** Callback to start replying */
  onReply?: (comment: CommentWithProfile) => void;
  /** Callback to submit reply inline */
  onSubmitReply?: (content: string) => void;
  /** Callback to cancel reply */
  onCancelReply?: () => void;
  /** Callback to edit comment */
  onEdit?: (commentId: string, newContent: string) => Promise<void>;
  /** Callback to delete comment */
  onDelete?: (commentId: string) => Promise<void>;
  /** Callback to mute thread */
  onMuteThread?: (threadId: string) => Promise<void>;
  /** Replies to this comment */
  replies?: CommentWithProfile[];
  /** Whether replies are loading */
  repliesLoading?: boolean;
  /** Callback to load replies */
  onLoadReplies?: () => void;
  /** Whether this is a reply (for indentation) */
  isReply?: boolean;
  /** Whether this is an optimistic (pending) comment */
  isPending?: boolean;
}

/**
 * Single comment with author info, content, and actions.
 * Supports nested replies (one level) and inline reply form.
 */
export function CommentItem({
  comment,
  currentUserId,
  isContentOwner = false,
  isReplying = false,
  isSubmittingReply = false,
  onReply,
  onSubmitReply,
  onCancelReply,
  onEdit,
  onDelete,
  onMuteThread,
  replies,
  repliesLoading = false,
  onLoadReplies,
  isReply = false,
  isPending = false,
}: CommentItemProps) {
  const t = useTranslations("comments");
  const [showReplies, setShowReplies] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const isOwnComment = currentUserId === comment.user_id;
  const canModerate = isContentOwner && !isOwnComment;
  const showActions = isOwnComment || canModerate;

  const displayName = comment.display_name || comment.username || "Anonymous";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Use state for relative time to avoid hydration mismatch
  // (time changes between server render and client hydration)
  const [relativeTime, setRelativeTime] = useState<string>("");

  useEffect(() => {
    setRelativeTime(formatDistanceToNow(new Date(comment.created_at), { addSuffix: true }));
  }, [comment.created_at]);

  // Focus reply input when replying starts
  useEffect(() => {
    if (isReplying && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [isReplying]);

  // Auto-expand replies when replying to show the new reply
  useEffect(() => {
    if (isReplying && comment.reply_count > 0 && !showReplies) {
      setShowReplies(true);
      if (!replies?.length) {
        onLoadReplies?.();
      }
    }
  }, [isReplying, comment.reply_count, showReplies, replies?.length, onLoadReplies]);

  const handleReply = () => {
    triggerHaptic("selection");
    onReply?.(comment);
  };

  const handleSubmitReply = () => {
    const trimmed = replyContent.trim();
    if (!trimmed || isSubmittingReply) return;
    triggerHaptic("selection");
    onSubmitReply?.(trimmed);
    setReplyContent("");
  };

  const handleCancelReply = () => {
    triggerHaptic("light");
    setReplyContent("");
    onCancelReply?.();
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    triggerHaptic("medium");
    setIsDeleting(true);
    try {
      await onDelete?.(comment.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleReplies = () => {
    triggerHaptic("light");
    if (!showReplies && comment.reply_count > 0 && !replies?.length) {
      onLoadReplies?.();
    }
    setShowReplies(!showReplies);
  };

  const handleMuteThread = () => {
    triggerHaptic("selection");
    onMuteThread?.(comment.id);
  };

  return (
    <div className={`${isReply ? "pl-10" : ""} ${isPending ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={comment.avatar_url || undefined} alt={displayName} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: name + time + actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{displayName}</span>
              <span className="text-xs text-muted-foreground">{relativeTime}</span>
              {comment.is_edited && (
                <span className="text-xs text-muted-foreground italic">
                  ({t("edited")})
                </span>
              )}
              {isPending && (
                <span className="text-xs text-muted-foreground italic">
                  (sending...)
                </span>
              )}
            </div>

            {/* Actions dropdown */}
            {showActions && !comment.is_deleted && !isPending && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 -mr-1 -mt-1"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isOwnComment && onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(comment.id, comment.content)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      {t("edit")}
                    </DropdownMenuItem>
                  )}
                  {(isOwnComment || canModerate) && onDelete && (
                    <DropdownMenuItem
                      onClick={handleDelete}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t("delete")}
                    </DropdownMenuItem>
                  )}
                  {!isReply && onMuteThread && (
                    <DropdownMenuItem onClick={handleMuteThread}>
                      <BellOff className="w-4 h-4 mr-2" />
                      {t("mute")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Comment content */}
          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
            {comment.is_deleted ? (
              <span className="text-muted-foreground italic">{t("deleted")}</span>
            ) : (
              comment.content
            )}
          </p>

          {/* Reply button + thread toggle */}
          {!comment.is_deleted && !isReply && !isPending && (
            <div className="flex items-center gap-4 mt-2">
              {onReply && !isReplying && (
                <button
                  onClick={handleReply}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {t("reply")}
                </button>
              )}

              {comment.reply_count > 0 && (
                <button
                  onClick={handleToggleReplies}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showReplies ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      {t("hideReplies")}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      {t("viewReplies", { count: comment.reply_count })}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Inline reply form */}
          {isReplying && (
            <div className="mt-3 flex gap-2 items-end">
              <div className="flex-1">
                <textarea
                  ref={replyInputRef}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={t("replyPlaceholder", { name: displayName })}
                  disabled={isSubmittingReply}
                  rows={1}
                  className="w-full resize-none min-h-[40px] max-h-[100px] px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmitReply();
                    }
                    if (e.key === "Escape") {
                      handleCancelReply();
                    }
                  }}
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCancelReply}
                disabled={isSubmittingReply}
                className="h-10 w-10 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                onClick={handleSubmitReply}
                disabled={!replyContent.trim() || isSubmittingReply}
                className="h-10 w-10 flex-shrink-0"
              >
                {isSubmittingReply ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {(showReplies || isReplying) && (comment.reply_count > 0 || replies?.length) && (
        <div className="mt-3 space-y-3">
          {repliesLoading ? (
            <div className="pl-10 text-sm text-muted-foreground">
              Loading replies...
            </div>
          ) : (
            replies?.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                isContentOwner={isContentOwner}
                onEdit={onEdit}
                onDelete={onDelete}
                isReply
                isPending={reply.id.startsWith("temp-")}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
