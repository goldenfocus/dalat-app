"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

interface VideoToBackfill {
  id: string;
  media_url: string;
  event_id: string;
  created_at: string;
  status?: "pending" | "processing" | "success" | "error";
  error?: string;
}

interface BackfillStats {
  total_videos: number;
  cf_needs_backfill: number;
  storage_needs_backfill: number;
  already_has_thumbnail: number;
  storage_videos?: VideoToBackfill[];
}

async function generateThumbnailFromUrl(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Canvas context not available"));
      return;
    }

    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video load timeout"));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      video.src = "";
    };

    const onLoaded = () => {
      // Seek to 0.5s or 10% of video duration
      video.currentTime = Math.min(0.5, video.duration * 0.1);
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load video"));
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);

    video.addEventListener("seeked", () => {
      // Set canvas dimensions (max 400px for thumbnails)
      const maxSize = 400;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw the video frame
      ctx.drawImage(video, 0, 0, width, height);

      cleanup();

      // Convert to base64
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      resolve(base64);
    });

    video.src = videoUrl;
    video.load();
  });
}

export default function BackfillThumbnailsPage() {
  const [stats, setStats] = useState<BackfillStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/backfill-video-thumbnails?list=true");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runBackfill = useCallback(async () => {
    if (!stats?.storage_videos?.length) return;

    setIsBackfilling(true);
    const videos = [...stats.storage_videos];
    setProgress({ current: 0, total: videos.length, success: 0, failed: 0 });

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      setProgress((p) => ({ ...p, current: i + 1 }));

      // Update video status
      setStats((s) =>
        s
          ? {
              ...s,
              storage_videos: s.storage_videos?.map((v) =>
                v.id === video.id ? { ...v, status: "processing" } : v
              ),
            }
          : null
      );

      try {
        // Generate thumbnail from video URL
        const thumbnailBase64 = await generateThumbnailFromUrl(video.media_url);

        // Send to API
        const res = await fetch("/api/admin/backfill-video-thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            momentId: video.id,
            thumbnailBase64,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }

        // Update video status
        setStats((s) =>
          s
            ? {
                ...s,
                storage_videos: s.storage_videos?.map((v) =>
                  v.id === video.id ? { ...v, status: "success" } : v
                ),
              }
            : null
        );
        setProgress((p) => ({ ...p, success: p.success + 1 }));
      } catch (err) {
        console.error(`Failed to backfill ${video.id}:`, err);
        setStats((s) =>
          s
            ? {
                ...s,
                storage_videos: s.storage_videos?.map((v) =>
                  v.id === video.id
                    ? { ...v, status: "error", error: err instanceof Error ? err.message : "Unknown error" }
                    : v
                ),
              }
            : null
        );
        setProgress((p) => ({ ...p, failed: p.failed + 1 }));
      }

      // Small delay between videos to avoid overwhelming the browser
      await new Promise((r) => setTimeout(r, 500));
    }

    setIsBackfilling(false);
  }, [stats?.storage_videos]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Backfill Video Thumbnails</h1>
        <p className="text-muted-foreground mt-1">
          Generate thumbnails for videos stored in Supabase Storage
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={fetchStats} disabled={isLoading || isBackfilling}>
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {isLoading ? "Loading..." : "Check Status"}
        </Button>

        {stats?.storage_videos && stats.storage_videos.length > 0 && (
          <Button onClick={runBackfill} disabled={isBackfilling} variant="default">
            {isBackfilling ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {progress.current}/{progress.total}
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Backfill ({stats.storage_videos.length} videos)
              </>
            )}
          </Button>
        )}
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Total Videos</div>
            <div className="text-2xl font-bold">{stats.total_videos}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Have Thumbnails</div>
            <div className="text-2xl font-bold text-green-600">{stats.already_has_thumbnail}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">Storage (Need Backfill)</div>
            <div className="text-2xl font-bold text-orange-600">{stats.storage_needs_backfill}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">CF Stream (Auto)</div>
            <div className="text-2xl font-bold text-blue-600">{stats.cf_needs_backfill}</div>
          </div>
        </div>
      )}

      {isBackfilling && (
        <div className="rounded-lg border p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-3">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">Success: {progress.success}</span>
            <span className="text-red-600">Failed: {progress.failed}</span>
          </div>
        </div>
      )}

      {stats?.storage_videos && stats.storage_videos.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Videos to Backfill</h3>
          <div className="grid gap-2 max-h-[400px] overflow-y-auto">
            {stats.storage_videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-3 p-3 rounded-lg border text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs truncate">{video.id}</div>
                  <div className="text-muted-foreground text-xs truncate">
                    {video.media_url}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {video.status === "processing" && (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  )}
                  {video.status === "success" && (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  )}
                  {video.status === "error" && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs">{video.error}</span>
                    </span>
                  )}
                  {!video.status && (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
