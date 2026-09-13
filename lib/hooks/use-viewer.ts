"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Viewer = { profile: Profile | null; isGodMode: boolean };
const empty: Viewer = { profile: null, isGodMode: false };
let viewer = empty;
let adminProfile: Profile | null = null;
let revision = 0;
let loading: Promise<void> | null = null;
let exiting: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Viewer) {
  revision++;
  viewer = next;
  listeners.forEach((listener) => listener());
}

export function enterGodMode(profile: Profile) {
  if (!viewer.isGodMode) adminProfile = viewer.profile;
  publish({ profile, isGodMode: true });
}

export function exitGodMode() {
  // Both exit controls share one restore request: refresh tokens are single-use.
  if (!exiting) {
    exiting = (async () => {
      const response = await fetch("/api/admin/exit-impersonation", {
        method: "POST", signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Failed to restore admin session");
      const data = await response.json();
      publish({ profile: data.restored === false ? null : (data.profile ?? adminProfile), isGodMode: false });
      adminProfile = null;
      // Do not delay the redirect/banner removal for another request.
      void refreshViewer();
    })().finally(() => { exiting = null; });
  }
  return exiting;
}

export async function refreshViewer() {
  const started = ++revision;
  try {
    const response = await fetch("/api/admin/god-mode-state", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return;
    const data = await response.json();
    // Ignore requests that started before a successful identity switch.
    if (started !== revision) return;
    publish({ profile: data.profile ?? data.targetProfile ?? null, isGodMode: data.isActive });
  } catch {
    // Keep the last confirmed identity on transient network failures.
  }
}

export function useViewer() {
  const pathname = usePathname();
  const state = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => viewer,
    () => empty,
  );
  useEffect(() => {
    if (!loading) loading = refreshViewer().finally(() => { loading = null; });
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Do not call Supabase methods inside its auth callback/lock.
      setTimeout(() => { void refreshViewer(); }, 0);
    });
    const onFocus = () => { void refreshViewer(); };
    window.addEventListener("focus", onFocus);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);
  return state;
}
