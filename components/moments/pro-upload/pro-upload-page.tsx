"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowLeft, Camera } from "lucide-react";
import { useBulkUpload } from "@/lib/hooks/use-bulk-upload";
import { FileDropZone } from "./file-drop-zone";
import { UploadStats } from "./upload-stats";
import { UploadControls } from "./upload-controls";
import { UploadQueue } from "./upload-queue";

interface ProUploadPageProps {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  userId: string;
}

export function ProUploadPage({
  eventId,
  eventSlug,
  eventTitle,
  userId,
}: ProUploadPageProps) {
  const t = useTranslations("moments.proUpload");

  const {
    state,
    addFiles,
    removeFile,
    startUpload,
    pauseUpload,
    resumeUpload,
    retryFile,
    retryAllFailed,
    clearComplete,
  } = useBulkUpload(eventId, userId);

  const hasFiles = state.stats.total > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="container max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href={`/events/${eventSlug}/moments`}
              className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t("back")}</span>
            </Link>

            <div className="flex items-center gap-2 text-sm">
              <Camera className="w-4 h-4 text-primary" />
              <span className="font-medium">{t("title")}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Event title */}
        <div className="text-center">
          <h1 className="text-xl font-semibold">{eventTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>

        {/* Drop zone - always visible when no active upload */}
        {state.status === "idle" && (
          <FileDropZone
            onFilesSelected={addFiles}
            disabled={state.status !== "idle"}
          />
        )}

        {/* Stats and controls - shown when files selected */}
        {hasFiles && (
          <div className="space-y-4 p-4 rounded-xl border bg-card">
            <UploadStats stats={state.stats} status={state.status} />

            <UploadControls
              status={state.status}
              stats={state.stats}
              eventSlug={eventSlug}
              onStart={startUpload}
              onPause={pauseUpload}
              onResume={resumeUpload}
              onRetryAll={retryAllFailed}
              onClearComplete={clearComplete}
            />
          </div>
        )}

        {/* Add more files button when uploading */}
        {hasFiles && state.status !== "complete" && (
          <FileDropZone
            onFilesSelected={addFiles}
            disabled={false}
          />
        )}

        {/* File queue */}
        {hasFiles && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("fileQueue")} ({state.stats.total})
            </h2>
            <UploadQueue
              files={state.files}
              onRemove={removeFile}
              onRetry={retryFile}
            />
          </div>
        )}
      </main>
    </div>
  );
}
