"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ExternalLink, Check, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  useInAppBrowser,
  BROWSER_DISPLAY_NAMES,
} from "@/lib/hooks/use-in-app-browser";
import { cn } from "@/lib/utils";

interface InAppBrowserWarningProps {
  className?: string;
}

export function InAppBrowserWarning({ className }: InAppBrowserWarningProps) {
  const t = useTranslations("auth.inAppBrowser");
  const { isInAppBrowser, browserType, openInExternalBrowser } =
    useInAppBrowser();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Don't show if not in an in-app browser or already dismissed
  if (!isInAppBrowser || dismissed) {
    return null;
  }

  const appName = browserType ? BROWSER_DISPLAY_NAMES[browserType] : t("thisApp");

  const handleOpenExternal = async () => {
    const success = await openInExternalBrowser();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <Alert
      className={cn(
        "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between pr-1">
        <span>{t("title")}</span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="p-1.5 -mr-1 rounded-md hover:bg-amber-500/20 active:scale-95 transition-all"
          aria-label={t("dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">{t("description", { appName })}</p>

        <div className="flex flex-col gap-2">
          {/* Primary action: Open in browser via share sheet or copy */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenExternal}
            className="w-full gap-2 border-amber-500/50 hover:bg-amber-500/20 hover:text-amber-700 dark:hover:text-amber-300 text-amber-700 dark:text-amber-300"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                {t("linkCopied")}
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                {t("openInBrowser")}
              </>
            )}
          </Button>

          {/* Hint text for manual steps */}
          <p className="text-xs text-amber-600/80 dark:text-amber-400/80 text-center">
            {t("hint")}
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
