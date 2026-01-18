"use client";

import { useState } from "react";
import { Sparkles, Loader2, User, UserCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface AIAvatarDialogProps {
  profileId: string;
  displayName?: string;
  onAvatarGenerated: (url: string) => void;
  disabled?: boolean;
}

type AvatarStyle = "male" | "female" | "neutral" | "custom";

const styleIcons: Record<AvatarStyle, React.ReactNode> = {
  male: <User className="w-5 h-5" />,
  female: <UserCircle className="w-5 h-5" />,
  neutral: <Sparkles className="w-5 h-5" />,
  custom: <Sparkles className="w-5 h-5" />,
};

export function AIAvatarDialog({
  profileId,
  displayName,
  onAvatarGenerated,
  disabled,
}: AIAvatarDialogProps) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("neutral");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          style: selectedStyle,
          customPrompt: selectedStyle === "custom" ? customPrompt : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate avatar");
      }

      const { imageUrl } = data;

      // Convert base64 to blob and upload to storage
      const base64Data = imageUrl.split(",")[1];
      const mimeType = imageUrl.split(";")[0].split(":")[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      // Upload to storage
      const supabase = createClient();
      const ext = mimeType.split("/")[1] || "png";
      const fileName = `${profileId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      onAvatarGenerated(publicUrl);
      setOpen(false);
      // Reset state for next time
      setSelectedStyle("neutral");
      setCustomPrompt("");
    } catch (err) {
      console.error("AI avatar generation error:", err);
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const styles: { value: AvatarStyle; label: string; description: string }[] = [
    {
      value: "male",
      label: t("avatarStyle.male"),
      description: t("avatarStyle.maleDesc"),
    },
    {
      value: "female",
      label: t("avatarStyle.female"),
      description: t("avatarStyle.femaleDesc"),
    },
    {
      value: "neutral",
      label: t("avatarStyle.neutral"),
      description: t("avatarStyle.neutralDesc"),
    },
    {
      value: "custom",
      label: t("avatarStyle.custom"),
      description: t("avatarStyle.customDesc"),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {t("generateAI")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {t("avatarDialog.title")}
          </DialogTitle>
          <DialogDescription>{t("avatarDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Style Selection */}
          <div className="grid grid-cols-2 gap-2">
            {styles.map((style) => (
              <button
                key={style.value}
                type="button"
                onClick={() => setSelectedStyle(style.value)}
                className={cn(
                  "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all",
                  "hover:bg-accent active:scale-95",
                  selectedStyle === style.value
                    ? "border-primary bg-primary/5"
                    : "border-transparent bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "p-2 rounded-full",
                    selectedStyle === style.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {styleIcons[style.value]}
                </div>
                <span className="font-medium text-sm">{style.label}</span>
                <span className="text-xs text-muted-foreground text-center">
                  {style.description}
                </span>
              </button>
            ))}
          </div>

          {/* Custom Prompt Input */}
          {selectedStyle === "custom" && (
            <div className="space-y-2">
              <AIEnhanceTextarea
                value={customPrompt}
                onChange={setCustomPrompt}
                placeholder={t("avatarDialog.customPlaceholder")}
                context="an AI avatar style description"
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                {t("avatarDialog.customHint")}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {error}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isGenerating}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || (selectedStyle === "custom" && !customPrompt.trim())}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("avatarDialog.generate")}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
