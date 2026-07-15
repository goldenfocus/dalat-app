"use client";

/**
 * Non-critical chrome that lives on every page.
 * Loaded client-side only so the initial hydration graph stays lean:
 * audio player, push prompts, PWA install, SW updates, heartbeat, etc.
 *
 * Note: next/dynamic requires options as an object literal (not a shared const).
 */
import dynamic from "next/dynamic";

export const DeferredMiniPlayer = dynamic(
  () => import("@/components/audio/mini-player").then((m) => m.MiniPlayer),
  { ssr: false }
);

export const DeferredUploadFAB = dynamic(
  () => import("@/components/moments/upload-fab").then((m) => m.UploadFAB),
  { ssr: false }
);

export const DeferredNotificationPrompt = dynamic(
  () =>
    import("@/components/notification-prompt").then((m) => m.NotificationPrompt),
  { ssr: false }
);

export const DeferredSwUpdateHandler = dynamic(
  () => import("@/components/sw-update-handler").then((m) => m.SwUpdateHandler),
  { ssr: false }
);

export const DeferredInstallAppBanner = dynamic(
  () => import("@/components/pwa").then((m) => m.InstallAppBanner),
  { ssr: false }
);

export const DeferredHeartbeat = dynamic(
  () => import("@/components/heartbeat").then((m) => m.Heartbeat),
  { ssr: false }
);

export const DeferredPerformanceMonitor = dynamic(
  () =>
    import("@/components/performance-monitor").then((m) => m.PerformanceMonitor),
  { ssr: false }
);

export const DeferredBadgeClearer = dynamic(
  () => import("@/components/badge-clearer").then((m) => m.BadgeClearer),
  { ssr: false }
);

export const DeferredLocaleMismatchBanner = dynamic(
  () =>
    import("@/components/locale-mismatch-banner").then(
      (m) => m.LocaleMismatchBanner
    ),
  { ssr: false }
);

export const DeferredIosViewportAnchor = dynamic(
  () =>
    import("@/components/ios-viewport-anchor").then((m) => m.IosViewportAnchor),
  { ssr: false }
);

export const DeferredGodModeIndicator = dynamic(
  () =>
    import("@/components/god-mode-indicator").then(
      (m) => m.GodModeIndicatorWrapper
    ),
  { ssr: false }
);
