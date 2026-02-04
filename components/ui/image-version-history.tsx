"use client";

import { useState, useEffect, useCallback } from "react";
import { History, RotateCcw, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import Image from "next/image";
import { cn as _cn } from "@/lib/utils";
import { optimizedImageUrl } from "@/lib/image-cdn";
import type { ImageVersion, ImageVersionContentType, ImageVersionFieldName } from "@/lib/types";

interface ImageVersionHistoryProps {
  contentType: ImageVersionContentType;
  contentId: string;
  fieldName: ImageVersionFieldName;
  currentImageUrl?: string | null;
  onRestore: (imageUrl: string) => void;
  disabled?: boolean;
}

export function ImageVersionHistory({
  contentType,
  contentId,
  fieldName,
  currentImageUrl,
  onRestore,
  disabled = false,
}: ImageVersionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<ImageVersion | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!contentId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        contentType,
        contentId,
        fieldName,
      });
      const res = await fetch(`/api/image-versions?${params}`);

      if (!res.ok) {
        throw new Error("Failed to load versions");
      }

      const data = await res.json();
      setVersions(data.versions || []);
    } catch (err) {
      console.error("Failed to fetch versions:", err);
      setError("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  }, [contentType, contentId, fieldName]);

  // Fetch versions on mount to know if we should show the button
  useEffect(() => {
    if (contentId) {
      fetchVersions();
    }
  }, [contentId, fetchVersions]);

  const handleRestore = async (version: ImageVersion) => {
    setIsRestoring(true);
    setError(null);

    try {
      const res = await fetch("/api/image-versions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });

      if (!res.ok) {
        throw new Error("Failed to restore version");
      }

      const data = await res.json();
      onRestore(data.imageUrl);
      setPreviewVersion(null);
    } catch (err) {
      console.error("Failed to restore version:", err);
      setError("Failed to restore version");
    } finally {
      setIsRestoring(false);
    }
  };

  // Filter out the current version (it's the active one)
  const historicalVersions = versions.filter(
    (v) => v.image_url !== currentImageUrl
  );

  // Don't show if no content ID yet (new item being created)
  if (!contentId) return null;

  // Don't show if still loading on first fetch, or if there are no historical versions
  if (isLoading && versions.length === 0) return null;
  if (!isLoading && historicalVersions.length === 0) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-sm disabled:opacity-50"
      >
        <span className="flex items-center gap-2 text-blue-400">
          <History className="h-4 w-4" />
          Version history
          {historicalVersions.length > 0 && (
            <span className="text-xs opacity-70">
              ({historicalVersions.length})
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-blue-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-400" />
        )}
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="space-y-3 pl-2 border-l-2 border-blue-500/30">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading versions...
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-2">{error}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {historicalVersions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => setPreviewVersion(version)}
                  className="relative aspect-video rounded-md overflow-hidden group hover:ring-2 hover:ring-blue-500 transition-all"
                >
                  <Image
                    src={optimizedImageUrl(version.image_url, { width: 200 }) || version.image_url}
                    alt={version.alt || "Previous version"}
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <RotateCcw className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewVersion && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewVersion(null)}
        >
          <div
            className="bg-background rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium">Restore this version?</h3>
              <button
                type="button"
                onClick={() => setPreviewVersion(null)}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Image preview */}
            <div className="p-4">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <Image
                  src={previewVersion.image_url}
                  alt={previewVersion.alt || "Version preview"}
                  fill
                  className="object-contain"
                />
              </div>

              {/* Metadata */}
              <div className="mt-4 space-y-2 text-sm">
                {previewVersion.alt && (
                  <p>
                    <span className="text-muted-foreground">Alt: </span>
                    {previewVersion.alt}
                  </p>
                )}
                {previewVersion.generation_prompt && (
                  <p>
                    <span className="text-muted-foreground">Prompt: </span>
                    <span className="font-mono text-xs">
                      {previewVersion.generation_prompt.slice(0, 100)}
                      {previewVersion.generation_prompt.length > 100 && "..."}
                    </span>
                  </p>
                )}
                {previewVersion.colors && previewVersion.colors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Colors: </span>
                    <div className="flex gap-1">
                      {previewVersion.colors.slice(0, 5).map((color, i) => (
                        <div
                          key={i}
                          className="w-5 h-5 rounded-sm border border-border"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Generated: {new Date(previewVersion.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t">
              <button
                type="button"
                onClick={() => setPreviewVersion(null)}
                className="flex-1 px-4 py-2 rounded-md bg-muted hover:bg-muted/80 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRestore(previewVersion)}
                disabled={isRestoring}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
              >
                {isRestoring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Restore this version
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
