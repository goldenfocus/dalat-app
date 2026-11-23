"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { BACK, FORWARD, getAppHistoryDirections, subscribeToAppHistory } from "@/lib/navigation-history";

const controlClass = "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary";

export function HistoryControls({ className, overlay, onBackFallback }: {
  className?: string;
  overlay?: boolean;
  onBackFallback?: () => void;
}) {
  const common = useTranslations("common");
  const nav = useTranslations("nav");
  const directions = useSyncExternalStore(subscribeToAppHistory, getAppHistoryDirections, () => 0);
  const canGoBack = Boolean(directions & BACK);
  if (!directions && !onBackFallback) return null;

  const buttonClass = overlay
    ? "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-black/70 px-3 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    : controlClass;

  function goBack() {
    if (canGoBack) window.history.back();
    else onBackFallback?.();
  }

  return (
    <div role="group" aria-label={nav("history")} className={className} data-app-history>
      {(canGoBack || onBackFallback) && (
        <button type="button" onClick={goBack} className={buttonClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {common("back")}
        </button>
      )}
      {Boolean(directions & FORWARD) && (
        <button type="button" onClick={() => window.history.forward()} className={buttonClass}>
          <ArrowRight className="size-4" aria-hidden="true" />
          {nav("forward")}
        </button>
      )}
    </div>
  );
}
