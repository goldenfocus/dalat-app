"use client";

import { useTranslations } from "next-intl";
import { Loader2, MessageCircle } from "lucide-react";
import { CommentItem } from "./comment-item";
import { Button } from "@/components/ui/button";
import type { CommentWithProfile } from "@/lib/types";

interface CommentListProps {
  /** Comments to display */
  comments: CommentWithProfile[];
  /** Whether comments are loading */
  loading?: boolean;
  /** Current user's ID */
  currentUserId?: string;
  /** Whether current user is the content owner */
  isContentOwner?: boolean;
  /** ID of comment currently being replied to */
  replyingToId?: string;
  /** Whether reply is being submitted */
  isSubmittingReply?: boolean;
  /** Callback to reply to a comment */
  onReply?: (comment: CommentWithProfile) => void;
  /** Callback to submit reply */
  onSubmitReply?: (content: string) => void;
  /** Callback to cancel reply */
  onCancelReply?: () => void;
  /** Callback to edit a comment */
  onEdit?: (commentId: string, newContent: string) => Promise<void>;
  /** Callback to delete a comment */
  onDelete?: (commentId: string) => Promise<void>;
  /** Callback to mute a thread */
  onMuteThread?: (threadId: string) => Promise<void>;
  /** Callback to load replies for a comment */
  onLoadReplies?: (parentId: string) => Promise<CommentWithProfile[]>;
  /** Map of parent ID to loaded replies */
  repliesMap?: Map<string, CommentWithProfile[]>;
  /** Set of parent IDs currently loading replies */
  loadingReplies?: Set<string>;
  /** Whether there are more comments to load */
  hasMore?: boolean;
  /** Callback to load more comments */
  onLoadMore?: () => void;
  /** Whether more comments are loading */
  loadingMore?: boolean;
}

/**
 * Scrollable list of comments with loading states.
 */
export function CommentList({
  comments,
  loading = false,
  currentUserId,
  isContentOwner = false,
  replyingToId,
  isSubmittingReply = false,
  onReply,
  onSubmitReply,
  onCancelReply,
  onEdit,
  onDelete,
  onMuteThread,
  onLoadReplies,
  repliesMap,
  loadingReplies,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: CommentListProps) {
  const t = useTranslations("comments");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageCircle className="w-12 h-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">{t("noComments")}</p>
      </div>
    );
  }

  const handleLoadReplies = async (parentId: string) => {
    if (!onLoadReplies) return;
    await onLoadReplies(parentId);
  };

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          isContentOwner={isContentOwner}
          isReplying={replyingToId === comment.id}
          isSubmittingReply={isSubmittingReply && replyingToId === comment.id}
          onReply={onReply}
          onSubmitReply={onSubmitReply}
          onCancelReply={onCancelReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onMuteThread={onMuteThread}
          replies={repliesMap?.get(comment.id)}
          repliesLoading={loadingReplies?.has(comment.id)}
          onLoadReplies={() => handleLoadReplies(comment.id)}
          isPending={comment.id.startsWith("temp-")}
        />
      ))}

      {/* Load more button */}
      {hasMore && onLoadMore && (
        <div className="pt-2">
          <Button
            variant="ghost"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full"
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              t("loadMore")
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
