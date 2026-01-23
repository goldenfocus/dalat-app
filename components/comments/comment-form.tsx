"use client";

import { useState, useRef } from "react";
import { Send, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import { Button } from "@/components/ui/button";
import { triggerHaptic } from "@/lib/haptics";

interface CommentFormProps {
  /** Callback when comment is submitted */
  onSubmit: (content: string) => Promise<void>;
  /** Replying to someone? */
  replyingTo?: {
    id: string;
    name: string;
  };
  /** Clear reply state */
  onCancelReply?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the form */
  disabled?: boolean;
  /** Context for AI enhancement */
  aiContext?: string;
}

/**
 * Comment input form with AI enhancement support.
 * Includes reply-to indicator when replying to a comment.
 */
export function CommentForm({
  onSubmit,
  replyingTo,
  onCancelReply,
  placeholder,
  disabled = false,
  aiContext = "a comment on a community event",
}: CommentFormProps) {
  const t = useTranslations("comments");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return;

    triggerHaptic("selection");
    setIsSubmitting(true);

    try {
      await onSubmit(trimmed);
      setContent("");
      onCancelReply?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelReply = () => {
    triggerHaptic("light");
    onCancelReply?.();
    textareaRef.current?.focus();
  };

  const isEmpty = !content.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg text-sm">
          <span className="text-muted-foreground">
            {t("replyTo", { name: replyingTo.name })}
          </span>
          <button
            type="button"
            onClick={handleCancelReply}
            className="p-1 -m-1 hover:bg-muted rounded transition-colors"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <AIEnhanceTextarea
            ref={textareaRef}
            value={content}
            onChange={(val) => setContent(val)}
            placeholder={placeholder || t("placeholder")}
            context={aiContext}
            disabled={disabled || isSubmitting}
            rows={1}
            className="resize-none min-h-[44px] max-h-[120px]"
            aria-label={t("placeholder")}
          />
        </div>

        {/* Submit button */}
        <Button
          type="submit"
          size="icon"
          disabled={isEmpty || isSubmitting || disabled}
          className="flex-shrink-0 h-11 w-11"
          aria-label={t("postComment")}
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
    </form>
  );
}
