"use client";

import {
  Bell,
  BellOff,
  BellRing,
  Loader2,
  AlertCircle,
  Volume2,
  Vibrate,
  VolumeX,
  Check,
  Share,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePushNotifications } from "@/lib/hooks/use-push-notifications";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import { useState, useEffect, useTransition } from "react";
import type { NotificationMode } from "@/lib/types";

const NOTIFICATION_MODES = [
  {
    value: "sound_and_vibration" as NotificationMode,
    labelKey: "soundAndVibration",
    icon: BellRing,
  },
  {
    value: "sound_only" as NotificationMode,
    labelKey: "soundOnly",
    icon: Volume2,
  },
  {
    value: "vibration_only" as NotificationMode,
    labelKey: "vibrationOnly",
    icon: Vibrate,
  },
  {
    value: "silent" as NotificationMode,
    labelKey: "silent",
    icon: VolumeX,
  },
] as const;

export function NotificationSettings() {
  const t = useTranslations("notifications");
  const {
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    isSupported,
    isIOSSafari,
  } = usePushNotifications();

  const [mode, setMode] = useState<NotificationMode>("sound_and_vibration");
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch current mode when subscribed
  useEffect(() => {
    if (isSubscribed) {
      fetch("/api/push/preference")
        .then((res) => res.json())
        .then((data) => setMode(data.mode || "sound_and_vibration"))
        .catch(() => {});
    }
  }, [isSubscribed]);

  const handleToggle = async () => {
    triggerHaptic("selection");
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  const handleModeChange = (newMode: NotificationMode) => {
    if (newMode === mode || isPending) return;

    triggerHaptic("selection");
    setMode(newMode);

    startTransition(async () => {
      await fetch("/api/push/preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
    });
  };

  // Show skeleton during hydration to prevent mismatch
  if (!mounted) {
    return (
      <div className="w-full flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded bg-muted" />
          <div className="space-y-2">
            <div className="w-24 h-4 rounded bg-muted" />
            <div className="w-32 h-3 rounded bg-muted" />
          </div>
        </div>
        <div className="w-11 h-6 rounded-full bg-muted" />
      </div>
    );
  }

  // Special message for iOS Safari users - they need to install the PWA first
  if (isIOSSafari) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300">
        <Share className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("iosInstallRequired")}</p>
          <p className="text-xs opacity-80">{t("iosInstallDescription")}</p>
        </div>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 text-muted-foreground">
        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("unavailable")}</p>
          <p className="text-xs">{t("unavailableDescription")}</p>
        </div>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive">
        <BellOff className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("blocked")}</p>
          <p className="text-xs opacity-80">{t("blockedDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={cn(
          "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200",
          isSubscribed
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : isSubscribed ? (
            <BellRing className="w-5 h-5 text-primary" />
          ) : (
            <Bell className="w-5 h-5 text-muted-foreground" />
          )}
          <div className="text-left">
            <p
              className={cn(
                "text-sm font-medium",
                isSubscribed ? "text-primary" : "text-foreground"
              )}
            >
              {isSubscribed ? t("enabled") : t("enable")}
            </p>
            <p className="text-xs text-muted-foreground">
              {isSubscribed ? t("enabledDescription") : t("disabledDescription")}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative",
            isSubscribed ? "bg-primary" : "bg-muted"
          )}
        >
          <div
            className={cn(
              "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
              isSubscribed ? "translate-x-6" : "translate-x-1"
            )}
          />
        </div>
      </button>

      {/* Notification mode selector - only shown when subscribed */}
      {isSubscribed && (
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium text-foreground">
            {t("notificationStyle")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {NOTIFICATION_MODES.map((modeOption) => {
              const Icon = modeOption.icon;
              const isSelected = mode === modeOption.value;

              return (
                <button
                  key={modeOption.value}
                  onClick={() => handleModeChange(modeOption.value)}
                  disabled={isPending}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/50 hover:bg-muted/50",
                    isPending && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="relative">
                    <Icon
                      className={cn(
                        "w-5 h-5",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    {isSelected && (
                      <Check className="w-3 h-3 text-primary absolute -bottom-1 -right-1" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium text-center",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {t(modeOption.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
