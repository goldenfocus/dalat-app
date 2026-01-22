"use client";

import { useTranslations } from "next-intl";
import { Share, MoreVertical, Download, Smartphone, Monitor } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface InstallInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: "ios" | "android" | "desktop" | "unknown";
}

export function InstallInstructionsModal({
  open,
  onOpenChange,
  platform,
}: InstallInstructionsModalProps) {
  const t = useTranslations("install.modal");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* iOS Instructions */}
          {(platform === "ios" || platform === "unknown") && (
            <PlatformInstructions
              icon={<Smartphone className="w-5 h-5" />}
              title={t("ios.title")}
              steps={[
                { icon: <Share className="w-4 h-4" />, text: t("ios.step1") },
                { icon: null, text: t("ios.step2") },
                { icon: null, text: t("ios.step3") },
              ]}
              isActive={platform === "ios"}
            />
          )}

          {/* Android Instructions */}
          {(platform === "android" || platform === "unknown") && (
            <PlatformInstructions
              icon={<Smartphone className="w-5 h-5" />}
              title={t("android.title")}
              steps={[
                { icon: <MoreVertical className="w-4 h-4" />, text: t("android.step1") },
                { icon: null, text: t("android.step2") },
                { icon: null, text: t("android.step3") },
              ]}
              isActive={platform === "android"}
            />
          )}

          {/* Desktop Instructions */}
          {(platform === "desktop" || platform === "unknown") && (
            <PlatformInstructions
              icon={<Monitor className="w-5 h-5" />}
              title={t("desktop.title")}
              steps={[
                { icon: <Download className="w-4 h-4" />, text: t("desktop.step1") },
                { icon: null, text: t("desktop.step2") },
                { icon: null, text: t("desktop.step3") },
              ]}
              isActive={platform === "desktop"}
            />
          )}

          <p className="text-xs text-muted-foreground text-center">
            {t("alreadyInstalled")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PlatformInstructionsProps {
  icon: React.ReactNode;
  title: string;
  steps: Array<{ icon: React.ReactNode | null; text: string }>;
  isActive?: boolean;
}

function PlatformInstructions({ icon, title, steps, isActive }: PlatformInstructionsProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isActive ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="text-primary">{icon}</div>
        <h3 className="font-medium">{title}</h3>
      </div>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-3 text-sm">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium flex-shrink-0 mt-0.5">
              {index + 1}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              {step.icon && <span className="text-primary">{step.icon}</span>}
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
