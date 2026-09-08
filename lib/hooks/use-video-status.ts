"use client";

import { useEffect, useState } from "react";
import type { MomentVideoStatus } from "@/lib/types";

type VideoMoment = {
  id: string;
  cf_video_uid?: string | null;
  video_status?: MomentVideoStatus | null;
  cf_playback_url?: string | null;
};

export function reconcileVideoStatus(id: string) {
  return fetch(`/api/moments/${id}/video-status`, { method: "POST", signal: AbortSignal.timeout(10000) });
}

// Poll only the open video. Never overlap requests or carry results to another slide.
export function useVideoStatus<T extends VideoMoment>(moment: T, active = true): T {
  const [resolved, setResolved] = useState<VideoMoment | null>(null);
  const current = resolved?.id === moment?.id ? { ...moment, ...resolved } : moment;
  useEffect(() => {
    if (!active || !moment?.cf_video_uid || !["processing", "uploading"].includes(current.video_status || "")) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      let terminal = false;
      try {
        const response = await reconcileVideoStatus(moment.id);
        if (response.ok) {
          const result = await response.json();
          if (!cancelled) setResolved(result);
          terminal = result.video_status === "ready" || result.video_status === "error";
        }
      } catch (error) {
        console.warn("Video status check will retry", error);
      }
      if (!cancelled && !terminal) timer = setTimeout(poll, ++attempts < 20 ? 2000 : 15000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [moment?.id, moment?.cf_video_uid, current?.video_status, active]);
  return current as T;
}
