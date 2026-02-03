"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, RefreshCw, CheckCircle2, Copy } from "lucide-react";
import type { BulkUploadStats } from "@/lib/bulk-upload/types";

interface UploadStatsProps {
  stats: BulkUploadStats;
  status: "idle" | "uploading" | "paused" | "complete" | "error";
  onRetryAll?: () => void;
}

export function UploadStats({ stats, status, onRetryAll }: UploadStatsProps) {
  const t = useTranslations("moments.proUpload");

  // Count completed + skipped as "done" for progress
  const doneCount = stats.complete + stats.skipped;
  const progressPercent =
    stats.total > 0 ? Math.round((doneCount / stats.total) * 100) : 0;

  const activeCount = stats.uploading + stats.saving + stats.converting + stats.hashing;
  const pendingCount = stats.queued + stats.uploaded;

  // Determine if we're done (nothing left to process) but have failures
  const isDoneWithFailures = stats.failed > 0 && activeCount === 0 && pendingCount === 0;
  const isFullyComplete = doneCount === stats.total && stats.total > 0 && stats.failed === 0;

  return (
    <div className="space-y-3">
      {/* Progress bar with animated stripes for active uploads */}
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        {/* Complete portion */}
        <div
          className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
        {/* Active upload portion with animated stripes */}
        {activeCount > 0 && (
          <div
            className="absolute inset-y-0 bg-primary transition-all duration-300 overflow-hidden"
            style={{
              left: `${progressPercent}%`,
              width: `${Math.round((activeCount / stats.total) * 100)}%`,
            }}
          >
            {/* Animated stripes to show activity */}
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
              style={{
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s linear infinite'
              }}
            />
          </div>
        )}
        {/* Failed portion (red) */}
        {stats.failed > 0 && (
          <div
            className="absolute inset-y-0 bg-destructive/80 transition-all duration-300"
            style={{
              left: `${progressPercent + (activeCount / stats.total) * 100}%`,
              width: `${Math.round((stats.failed / stats.total) * 100)}%`,
            }}
          />
        )}
      </div>

      {/* Status message when done with failures */}
      {isDoneWithFailures && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {t("uploadCompleteWithFailures", { complete: stats.complete, failed: stats.failed })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("tapRetryToTryAgain")}
            </p>
          </div>
          {onRetryAll && (
            <button
              onClick={onRetryAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 transition-all text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              {t("retryFailed")}
            </button>
          )}
        </div>
      )}

      {/* Success message when fully complete */}
      {isFullyComplete && status === "complete" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{t("allComplete")}</p>
            {stats.skipped > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("skippedDuplicates", { count: stats.skipped })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">
          {stats.complete} / {stats.total} {t("complete")}
        </span>

        {activeCount > 0 && (
          <span className="text-primary flex items-center gap-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            {activeCount} {t("uploading")}
          </span>
        )}

        {pendingCount > 0 && !isDoneWithFailures && (
          <span className="text-muted-foreground">
            {pendingCount} {t("queued")}
          </span>
        )}

        {stats.skipped > 0 && (
          <span className="text-amber-500 flex items-center gap-1">
            <Copy className="w-3 h-3" />
            {stats.skipped} {t("duplicates")}
          </span>
        )}

        {stats.failed > 0 && !isDoneWithFailures && (
          <span className="text-destructive flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {stats.failed} {t("failed")}
          </span>
        )}

        {status === "paused" && (
          <span className="text-amber-500 font-medium">{t("paused")}</span>
        )}
      </div>

      {/* CSS for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 1.5s linear infinite;
        }
      `}</style>
    </div>
  );
}
