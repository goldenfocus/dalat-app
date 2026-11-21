"use client";

import { rentalStatsCounts, type RentalStatsCounts } from "./stats";

const sessionKeys = new Map<string, string>();

function listingSession(listingId: string) {
  const existing = sessionKeys.get(listingId);
  if (existing) return existing;
  const key = "dalat:rentals:stats:" + listingId;
  let session = crypto.randomUUID();
  try {
    session = sessionStorage.getItem(key) || session;
    sessionStorage.setItem(key, session);
  } catch {
    // The in-memory tab session also works when web storage is unavailable.
  }
  sessionKeys.set(listingId, session);
  return session;
}

function send(listingId: string, media: string | null, signal?: AbortSignal) {
  return fetch(`/api/rentals/stats/${listingId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session: listingSession(listingId), media }),
    keepalive: media !== null,
    signal,
  });
}

export function trackRentalMedia(listingId: string, src: string) {
  if (document.hidden) return;
  void send(listingId, src).catch(() => {});
}

async function readRentalPublicStats(listingId: string, recordView: boolean, signal: AbortSignal) {
  const response = await (recordView
    ? send(listingId, null, signal)
    : fetch(`/api/rentals/stats/${listingId}`, { signal, cache: "no-store" }));
  if (!response.ok) return null;
  const counts = rentalStatsCounts.safeParse(await response.json());
  return counts.success ? counts.data : null;
}

export function observeRentalStats(listingId: string, recordView: boolean, onCounts?: (counts: RentalStatsCounts | null) => void) {
  const controller = new AbortController();
  let pending = false;

  async function refresh() {
    if (document.hidden || pending) return;
    pending = true;
    try {
      const counts = await readRentalPublicStats(listingId, recordView, controller.signal);
      if (!controller.signal.aborted) onCounts?.(counts);
    } catch {
      // Hide stale activity if the endpoint becomes unavailable.
      if (!controller.signal.aborted) onCounts?.(null);
    } finally {
      pending = false;
    }
  }

  void refresh();
  const timer = window.setInterval(refresh, 30_000);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    controller.abort();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", refresh);
  };
}
