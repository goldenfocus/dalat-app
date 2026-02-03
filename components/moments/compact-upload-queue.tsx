"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Image as ImageIcon,
  Video,
  Pause,
  Play,
  RotateCcw,
  X,
  Cloud,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CompactUploadItem {
  id: string;
  name: string;
  size: number;
  isVideo: boolean;
  status: "queued" | "compressing" | "converting" | "uploading" | "uploaded" | "processing" | "error";
  progress?: number;
  error?: string;
  previewUrl?: string;
  localThumbnailUrl?: string; // Video thumbnail
  caption?: string;
}

interface CompactUploadQueueProps {
  items: CompactUploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRetryAll: () => void;
  onCaptionChange?: (id: string, caption: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
  className?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compact upload queue for bulk file uploads.
 * Shows batch progress and a scrollable list instead of individual preview cards.
 */
export function CompactUploadQueue({
  items,
  onRemove,
  onRetry,
  onRetryAll,
  onCaptionChange,
  onPause,
  onResume,
  isPaused = false,
  className,
}: CompactUploadQueueProps) {
  const t = useTranslations("moments");

  // Calculate stats
  const stats = useMemo(() => {
    const total = items.length;
    const uploaded = items.filter((i) => i.status === "uploaded").length;
    const processing = items.filter((i) => i.status === "processing").length; // Server-side video processing
    const completed = uploaded + processing; // Both count as "done" from user's perspective
    const failed = items.filter((i) => i.status === "error").length;
    const inProgress = items.filter(
      (i) => i.status === "uploading" || i.status === "compressing" || i.status === "converting"
    ).length;
    const queued = items.filter((i) => i.status === "queued").length;

    // Calculate overall progress
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, inProgress, queued, processing, progress };
  }, [items]);

  const isComplete = stats.completed === stats.total && stats.total > 0;
  const hasErrors = stats.failed > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Batch Progress Header */}
      <div className="p-4 rounded-xl border bg-card space-y-3">
        {/* Status text */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isComplete && stats.processing > 0 ? (
              // All uploaded but some videos still processing in cloud
              <>
                <Cloud className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {t("bulkUpload.processingInCloud", { count: stats.processing })}
                </span>
              </>
            ) : isComplete ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-medium text-green-600 dark:text-green-400">
                  {t("bulkUpload.allComplete", { count: stats.total })}
                </span>
              </>
            ) : isPaused ? (
              <>
                <Pause className="w-5 h-5 text-amber-500" />
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {t("bulkUpload.paused")}
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="font-medium">
                  {t("bulkUpload.uploading", {
                    current: stats.completed + stats.inProgress,
                    total: stats.total,
                  })}
                </span>
              </>
            )}
          </div>

          {/* Pause/Resume button */}
          {!isComplete && onPause && onResume && (
            <Button
              variant="ghost"
              size="sm"
              onClick={isPaused ? onResume : onPause}
              className="h-8 px-2"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  {t("bulkUpload.resume")}
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  {t("bulkUpload.pause")}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                isComplete
                  ? "bg-green-500"
                  : hasErrors
                    ? "bg-amber-500"
                    : "bg-primary"
              )}
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {stats.completed} / {stats.total} {t("bulkUpload.complete")}
            </span>
            {hasErrors && (
              <button
                onClick={onRetryAll}
                className="text-destructive hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                {stats.failed} {t("bulkUpload.failed")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Compact file list */}
      <div className="max-h-[400px] overflow-y-auto space-y-2 rounded-lg border bg-card/50 p-2">
        {items.map((item) => (
          <CompactUploadItem
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
            onRetry={() => onRetry(item.id)}
            onCaptionChange={onCaptionChange ? (caption) => onCaptionChange(item.id, caption) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single item in the compact queue - with thumbnail preview and caption input
 */
function CompactUploadItem({
  item,
  onRemove,
  onRetry,
  onCaptionChange,
}: {
  item: CompactUploadItem;
  onRemove: () => void;
  onRetry: () => void;
  onCaptionChange?: (caption: string) => void;
}) {
  const t = useTranslations("moments");
  const isActive = item.status === "uploading" || item.status === "compressing" || item.status === "converting";
  const isProcessing = item.status === "processing"; // Video in cloud
  const isError = item.status === "error";
  const isDone = item.status === "uploaded";

  // Get the best available thumbnail
  const thumbnailUrl = item.localThumbnailUrl || item.previewUrl;

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors overflow-hidden",
        isError && "border-destructive/30 bg-destructive/5",
        isDone && "border-green-500/30 bg-green-500/5",
        isProcessing && "border-blue-500/30 bg-blue-500/5",
        isActive && "border-primary/30 bg-primary/5",
        !isActive && !isDone && !isError && !isProcessing && "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-3 p-2">
        {/* Thumbnail */}
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {thumbnailUrl ? (
            item.isVideo ? (
              <img
                src={thumbnailUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={thumbnailUrl}
                alt={item.name}
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {item.isVideo ? (
                <Video className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          )}
          {/* Video indicator overlay */}
          {item.isVideo && thumbnailUrl && (
            <div className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-black/60">
              <Play className="w-2.5 h-2.5 text-white fill-current" />
            </div>
          )}
          {/* Status overlay for active uploads */}
          {isActive && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* File info + caption */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {/* Status icon */}
            <div className="w-4 h-4 flex-shrink-0">
              {isProcessing ? (
                <Cloud className="w-4 h-4 text-blue-500 animate-pulse" />
              ) : isError ? (
                <XCircle className="w-4 h-4 text-destructive" />
              ) : isDone ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : null}
            </div>
            {/* File name */}
            <span className="text-sm truncate flex-1" title={item.name}>
              {item.name}
            </span>
            {/* Size */}
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatSize(item.size)}
            </span>
          </div>

          {/* Progress bar for active uploads */}
          {isActive && item.progress !== undefined && (
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}

          {/* Caption input - only show when uploaded or processing */}
          {(isDone || isProcessing) && onCaptionChange && (
            <input
              type="text"
              value={item.caption || ""}
              onChange={(e) => onCaptionChange(e.target.value)}
              placeholder={t("addCaption")}
              className="w-full text-xs px-2 py-1 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
              maxLength={500}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isError && (
            <button
              onClick={onRetry}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
              title={t("bulkUpload.retry")}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {(item.status === "queued" || isError) && (
            <button
              onClick={onRemove}
              className="p-1.5 rounded-md hover:bg-accent transition-colors"
              title={t("bulkUpload.remove")}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
