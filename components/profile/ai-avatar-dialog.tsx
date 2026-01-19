"use client";

import { useState } from "react";
import { Sparkles, Loader2, User, UserCircle, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
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
  currentAvatarUrl?: string | null;
  onAvatarGenerated: (url: string) => void;
  disabled?: boolean;
}

type AvatarStyle = "male" | "female" | "neutral" | "custom";

const styleDescriptions: Record<AvatarStyle, string> = {
  male: "masculine-presenting person with strong, defined features",
  female: "feminine-presenting person with soft, elegant features",
  neutral: "person with androgynous, gender-neutral features that could be any gender",
  custom: "",
};

const styleIcons: Record<AvatarStyle, React.ReactNode> = {
  male: <User className="w-5 h-5" />,
  female: <UserCircle className="w-5 h-5" />,
  neutral: <Sparkles className="w-5 h-5" />,
  custom: <Sparkles className="w-5 h-5" />,
};

export function AIAvatarDialog({
  profileId,
  displayName,
  currentAvatarUrl,
  onAvatarGenerated,
  disabled,
}: AIAvatarDialogProps) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("neutral");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");

  // Build style-aware prompt
  const buildAvatarPrompt = () => {
    const nameContext = displayName?.trim()
      ? `for someone named ${displayName.slice(0, 50)}`
      : "for a friendly person";

    let styleContext: string;
    if (selectedStyle === "custom" && customPrompt.trim()) {
      styleContext = `The avatar should depict: ${customPrompt.slice(0, 200)}`;
    } else {
      const styleDesc = styleDescriptions[selectedStyle] || styleDescriptions.neutral;
      styleContext = `The avatar should depict a ${styleDesc}`;
    }

    return `Create a beautiful, artistic avatar portrait ${nameContext}.

${styleContext}

Style: Dreamy, ethereal digital art inspired by Đà Lạt, Vietnam's misty highlands.
Colors: Soft pastels with hints of misty purple, pine forest green, warm sunset orange, and flower pink.
Feel: Warm, welcoming, and slightly magical - like a peaceful morning in the mountains.
Composition: Abstract or stylized portrait, centered, suitable for a circular avatar crop.
Background: Soft gradient or gentle atmospheric elements (mist, soft bokeh, subtle nature motifs).
Important:
- Abstract/artistic style, NOT photorealistic
- Do NOT include any text or lettering
- Square 1:1 aspect ratio
- Suitable for use as a profile picture`;
  };

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "avatar",
          customPrompt: buildAvatarPrompt(),
          entityId: profileId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate avatar");
      }

      onAvatarGenerated(data.imageUrl);
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

  const handleRefine = async () => {
    if (!currentAvatarUrl || !refinementPrompt.trim()) return;
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "avatar",
          entityId: profileId,
          existingImageUrl: currentAvatarUrl,
          refinementPrompt: refinementPrompt.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to refine avatar");
      }

      onAvatarGenerated(data.imageUrl);
      setRefinementPrompt("");
      setShowRefinement(false);
      setOpen(false);
    } catch (err) {
      console.error("AI avatar refinement error:", err);
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

          {/* Refinement section - only when avatar exists */}
          {currentAvatarUrl && (
            <>
              <button
                type="button"
                onClick={() => setShowRefinement(!showRefinement)}
                disabled={isGenerating}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-sm disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-violet-400">
                  <Wand2 className="w-4 h-4" />
                  {t("avatarDialog.refineExisting")}
                </span>
                {showRefinement ? (
                  <ChevronUp className="w-4 h-4 text-violet-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-violet-400" />
                )}
              </button>

              {showRefinement && (
                <div className="space-y-2 pl-2 border-l-2 border-violet-500/30">
                  <textarea
                    value={refinementPrompt}
                    onChange={(e) => setRefinementPrompt(e.target.value)}
                    placeholder={t("avatarDialog.refinementPlaceholder")}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm resize-none"
                    disabled={isGenerating}
                  />
                  <Button
                    type="button"
                    onClick={handleRefine}
                    disabled={isGenerating || !refinementPrompt.trim()}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                    size="sm"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("generating")}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        {t("avatarDialog.applyRefinement")}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </>
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
