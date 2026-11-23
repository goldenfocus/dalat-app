"use client";

import { useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { BACK, FORWARD, getAppHistoryDirections, subscribeToAppHistory } from "@/lib/navigation-history";

const controlClass = "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary";

export function HistoryControls({ className }: { className?: string }) {
  const common = useTranslations("common");
  const nav = useTranslations("nav");
  const directions = useSyncExternalStore(subscribeToAppHistory, getAppHistoryDirections, () => 0);
  if (!directions) return null;

  return (
    <div role="group" aria-label={nav("history")} className={className} data-app-history>
      {Boolean(directions & BACK) && (
        <button type="button" onClick={() => window.history.back()} className={controlClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          {common("back")}
        </button>
      )}
      {Boolean(directions & FORWARD) && (
        <button type="button" onClick={() => window.history.forward()} className={controlClass}>
          <ArrowRight className="size-4" aria-hidden="true" />
          {nav("forward")}
        </button>
      )}
    </div>
  );
}
