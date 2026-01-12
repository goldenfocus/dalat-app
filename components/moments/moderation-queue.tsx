"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { isVideoUrl } from "@/lib/media-utils";
import { triggerHaptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { MomentWithProfile } from "@/lib/types";

interface ModerationQueueProps {
  moments: (MomentWithProfile & { status: string })[];
}

export function ModerationQueue({ moments: initialMoments }: ModerationQueueProps) {
  const router = useRouter();
  const t = useTranslations("moments.moderation");
  const tCommon = useTranslations("common");
  const [moments, setMoments] = useState(initialMoments);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (momentId: string) => {
    triggerHaptic("selection");
    setProcessingId(momentId);

    const supabase = createClient();
    const { error } = await supabase.rpc("approve_moment", {
      p_moment_id: momentId,
    });

    if (error) {
      console.error("Failed to approve moment:", error);
      setProcessingId(null);
      return;
    }

    // Remove from local state
    setMoments((prev) => prev.filter((m) => m.id !== momentId));
    setProcessingId(null);
    triggerHaptic("medium");
    router.refresh();
  };

  const handleReject = async (momentId: string) => {
    triggerHaptic("selection");
    setProcessingId(momentId);

    const supabase = createClient();
    const { error } = await supabase.rpc("reject_moment", {
      p_moment_id: momentId,
      p_reason: null,
    });

    if (error) {
      console.error("Failed to reject moment:", error);
      setProcessingId(null);
      return;
    }

    // Remove from local state
    setMoments((prev) => prev.filter((m) => m.id !== momentId));
    setProcessingId(null);
    triggerHaptic("medium");
    router.refresh();
  };

  if (moments.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <Check className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground">{t("noPending")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("pendingCount", { count: moments.length })}
      </p>

      <div className="space-y-4">
        {moments.map((moment) => {
          const isProcessing = processingId === moment.id;
          const isVideo = isVideoUrl(moment.media_url);

          return (
            <article
              key={moment.id}
              className={cn(
                "bg-card border rounded-lg overflow-hidden transition-opacity",
                isProcessing && "opacity-50"
              )}
            >
              {/* Media preview */}
              {moment.content_type !== "text" && moment.media_url && (
                <div className="aspect-video bg-muted relative">
                  {isVideo ? (
                    <video
                      src={moment.media_url}
                      className="w-full h-full object-contain"
                      controls
                      playsInline
                    />
                  ) : (
                    <img
                      src={moment.media_url}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
              )}

              {/* Text-only content */}
              {moment.content_type === "text" && moment.text_content && (
                <div className="p-4 bg-gradient-to-br from-primary/10 to-primary/5">
                  <p className="text-sm whitespace-pre-wrap">{moment.text_content}</p>
                </div>
              )}

              {/* Info and actions */}
              <div className="p-4 space-y-3">
                {/* User info */}
                <div className="flex items-center gap-2">
                  {moment.avatar_url ? (
                    <img
                      src={moment.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {moment.display_name || moment.username || tCommon("anonymous")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(moment.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Caption if media moment */}
                {moment.content_type !== "text" && moment.text_content && (
                  <p className="text-sm text-muted-foreground">{moment.text_content}</p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleApprove(moment.id)}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {t("approve")}
                  </button>

                  <button
                    onClick={() => handleReject(moment.id)}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                    {t("reject")}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
