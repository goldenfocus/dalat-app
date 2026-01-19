"use client";

import { useTranslations } from "next-intl";
import type { BulkUploadStats } from "@/lib/bulk-upload/types";

interface UploadStatsProps {
  stats: BulkUploadStats;
  status: "idle" | "uploading" | "paused" | "complete" | "error";
}

export function UploadStats({ stats, status }: UploadStatsProps) {
  const t = useTranslations("moments.proUpload");

  const progressPercent =
    stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0;

  const activeCount = stats.uploading + stats.saving;
  const pendingCount = stats.queued + stats.uploaded;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        {/* Complete portion */}
        <div
          className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
        {/* Active upload portion */}
        {activeCount > 0 && (
          <div
            className="absolute inset-y-0 bg-primary animate-pulse transition-all duration-300"
            style={{
              left: `${progressPercent}%`,
              width: `${Math.round((activeCount / stats.total) * 100)}%`,
            }}
          />
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">
          {stats.complete} / {stats.total} {t("complete")}
        </span>

        {activeCount > 0 && (
          <span className="text-primary">
            {activeCount} {t("uploading")}
          </span>
        )}

        {pendingCount > 0 && status !== "complete" && (
          <span className="text-muted-foreground">
            {pendingCount} {t("queued")}
          </span>
        )}

        {stats.failed > 0 && (
          <span className="text-destructive">
            {stats.failed} {t("failed")}
          </span>
        )}

        {status === "paused" && (
          <span className="text-amber-500 font-medium">{t("paused")}</span>
        )}

        {status === "complete" && stats.total > 0 && (
          <span className="text-green-500 font-medium">{t("allComplete")}</span>
        )}
      </div>
    </div>
  );
}
