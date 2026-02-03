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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface CompactUploadItem {
  id: string;
  name: string;
  size: number;
  isVideo: boolean;
  status: "queued" | "compressing" | "uploading" | "uploaded" | "error";
  progress?: number;
  error?: string;
  previewUrl?: string;
}

interface CompactUploadQueueProps {
  items: CompactUploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRetryAll: () => void;
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
  onPause,
  onResume,
  isPaused = false,
  className,
}: CompactUploadQueueProps) {
  const t = useTranslations("moments");

  // Calculate stats
  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === "uploaded").length;
    const failed = items.filter((i) => i.status === "error").length;
    const inProgress = items.filter(
      (i) => i.status === "uploading" || i.status === "compressing"
    ).length;
    const queued = items.filter((i) => i.status === "queued").length;

    // Calculate overall progress
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, failed, inProgress, queued, progress };
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
            {isComplete ? (
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
      <div className="max-h-[300px] overflow-y-auto space-y-1 rounded-lg border bg-card/50 p-2">
        {items.map((item) => (
          <CompactUploadItem
            key={item.id}
            item={item}
            onRemove={() => onRemove(item.id)}
            onRetry={() => onRetry(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single item in the compact queue - minimal height, just essentials
 */
function CompactUploadItem({
  item,
  onRemove,
  onRetry,
}: {
  item: CompactUploadItem;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isActive = item.status === "uploading" || item.status === "compressing";
  const isError = item.status === "error";
  const isDone = item.status === "uploaded";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
        isError && "bg-destructive/10",
        isDone && "bg-green-500/10 opacity-60"
      )}
    >
      {/* Icon */}
      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
        {isActive ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : isError ? (
          <XCircle className="w-4 h-4 text-destructive" />
        ) : isDone ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : item.isVideo ? (
          <Video className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* File name */}
      <span className="flex-1 truncate" title={item.name}>
        {item.name}
      </span>

      {/* Size */}
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formatSize(item.size)}
      </span>

      {/* Status/Actions */}
      <div className="flex-shrink-0 w-16 flex justify-end">
        {isActive && item.progress !== undefined && (
          <span className="text-xs text-primary">{item.progress}%</span>
        )}
        {isError && (
          <button
            onClick={onRetry}
            className="p-1 rounded hover:bg-accent"
            title="Retry"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {(item.status === "queued" || isError) && (
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-accent"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
