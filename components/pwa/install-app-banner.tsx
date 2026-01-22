"use client";

import { useTranslations } from "next-intl";
import { X, Download, HelpCircle } from "lucide-react";
import { useInstallPrompt } from "@/lib/hooks/use-install-prompt";
import { InstallInstructionsModal } from "./install-instructions-modal";
import { Button } from "@/components/ui/button";

/**
 * A banner that prompts users to install the PWA.
 * - Shows native install prompt on Chrome/Edge (Android + Desktop)
 * - Shows "How to Install" modal for iOS Safari (which doesn't support beforeinstallprompt)
 * - Remembers dismissal for 7 days
 * - Doesn't show if app is already installed (standalone mode)
 */
export function InstallAppBanner() {
  const t = useTranslations("install.banner");
  const {
    installState,
    platform,
    canPrompt,
    promptInstall,
    dismissPrompt,
    showInstructions,
    setShowInstructions,
  } = useInstallPrompt();

  // Don't render if installed, dismissed, or unsupported
  if (installState !== "prompt") {
    return (
      <InstallInstructionsModal
        open={showInstructions}
        onOpenChange={setShowInstructions}
        platform={platform}
      />
    );
  }

  const handleInstall = async () => {
    const installed = await promptInstall();
    if (!installed && !canPrompt) {
      // If native prompt not available, show manual instructions
      setShowInstructions(true);
    }
  };

  return (
    <>
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card/95 backdrop-blur-md border border-border shadow-lg">
          {/* App Icon */}
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex-shrink-0">
            <Download className="w-6 h-6" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{t("title")}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {t("description")}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Install button - primary action */}
            <Button
              size="sm"
              onClick={handleInstall}
              className="h-8 px-3 text-xs font-medium"
            >
              {canPrompt ? t("install") : t("howTo")}
            </Button>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={dismissPrompt}
              aria-label={t("dismiss")}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Help link for iOS users who might not know how to install */}
        {platform === "ios" && (
          <button
            onClick={() => setShowInstructions(true)}
            className="flex items-center gap-1.5 mt-2 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {t("howTo")}
          </button>
        )}
      </div>

      <InstallInstructionsModal
        open={showInstructions}
        onOpenChange={setShowInstructions}
        platform={platform}
      />
    </>
  );
}
