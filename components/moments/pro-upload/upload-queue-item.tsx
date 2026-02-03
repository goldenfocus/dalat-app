"use client";

import { useTranslations } from "next-intl";
import {
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  RotateCcw,
  X,
  Image as ImageIcon,
  Video,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileUploadState } from "@/lib/bulk-upload/types";

interface UploadQueueItemProps {
  file: FileUploadState;
  onRemove: () => void;
  onRetry: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadQueueItem({ file, onRemove, onRetry }: UploadQueueItemProps) {
  const t = useTranslations("moments.proUpload");

  const statusIcon = {
    queued: <Clock className="w-4 h-4 text-muted-foreground" />,
    hashing: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
    validating: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
    converting: <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />,
    uploading: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
    uploaded: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
    saving: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
    retrying: <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />,
    complete: <CheckCircle className="w-4 h-4 text-green-500" />,
    skipped: <Copy className="w-4 h-4 text-amber-500" />,
    error: <XCircle className="w-4 h-4 text-destructive" />,
  };

  const statusText = {
    queued: t("statusQueued"),
    hashing: t("statusHashing"),
    validating: t("statusValidating"),
    converting: t("statusConverting"),
    uploading: t("statusUploading"),
    uploaded: t("statusUploaded"),
    saving: t("statusSaving"),
    retrying: t("statusRetrying"),
    complete: t("statusComplete"),
    skipped: t("statusSkipped"),
    error: file.error || t("statusError"),
  };

  const isActive = ["hashing", "validating", "converting", "uploading", "uploaded", "saving", "retrying"].includes(
    file.status
  );
  const canRemove = ["queued", "error", "complete", "skipped"].includes(file.status);
  const canRetry = file.status === "error";

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        file.status === "error" && "border-destructive/30 bg-destructive/5",
        file.status === "complete" && "border-green-500/30 bg-green-500/5",
        isActive && "border-primary/30 bg-primary/5"
      )}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {file.previewUrl ? (
          file.type === "video" ? (
            <video
              src={file.previewUrl}
              className="w-full h-full object-cover"
              muted
            />
          ) : (
            <img
              src={file.previewUrl}
              alt={file.name}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {file.type === "video" ? (
              <Video className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(file.size)}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            {statusIcon[file.status]}
            <span
              className={cn(
                file.status === "error" && "text-destructive",
                file.status === "complete" && "text-green-500"
              )}
            >
              {statusText[file.status]}
            </span>
          </span>
        </div>

        {/* Progress bar for uploading */}
        {file.status === "uploading" && (
          <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {canRetry && (
          <button
            onClick={onRetry}
            className="p-2 rounded-md hover:bg-accent transition-colors"
            title={t("retry")}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-2 rounded-md hover:bg-accent transition-colors"
            title={t("remove")}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
