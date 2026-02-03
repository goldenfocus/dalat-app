"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { UploadQueueItem } from "./upload-queue-item";
import type { FileUploadState } from "@/lib/bulk-upload/types";

interface UploadQueueProps {
  files: Map<string, FileUploadState>;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

const ITEM_HEIGHT = 76; // Height of each item in pixels
const OVERSCAN = 5; // Extra items to render above/below viewport

export function UploadQueue({ files, onRemove, onRetry }: UploadQueueProps) {
  const t = useTranslations("moments.proUpload");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(400);

  // Convert map to sorted array (errors first, then by status priority)
  const sortedFiles = useMemo(() => {
    const statusPriority: Record<FileUploadState["status"], number> = {
      error: 0,
      converting: 1,
      uploading: 2,
      hashing: 3,
      validating: 4,
      retrying: 5,
      saving: 6,
      uploaded: 7,
      queued: 8,
      complete: 9,
      skipped: 10,
    };

    return Array.from(files.values()).sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    });
  }, [files]);

  // Update container height on resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Calculate visible range
  const totalHeight = sortedFiles.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    sortedFiles.length,
    Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN
  );
  const visibleFiles = sortedFiles.slice(startIndex, endIndex);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  if (sortedFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        {t("noFiles")}
      </div>
    );
  }

  // For small lists, render without virtualization
  if (sortedFiles.length <= 20) {
    return (
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {sortedFiles.map((file) => (
          <UploadQueueItem
            key={file.id}
            file={file}
            onRemove={() => onRemove(file.id)}
            onRetry={() => onRetry(file.id)}
          />
        ))}
      </div>
    );
  }

  // Virtual scrolling for large lists
  return (
    <div
      ref={containerRef}
      className="h-[400px] overflow-y-auto pr-2"
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: startIndex * ITEM_HEIGHT,
            left: 0,
            right: 0,
          }}
        >
          {visibleFiles.map((file) => (
            <div key={file.id} style={{ height: ITEM_HEIGHT }} className="py-1">
              <UploadQueueItem
                file={file}
                onRemove={() => onRemove(file.id)}
                onRetry={() => onRetry(file.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
