"use client";

import { useState, useCallback } from "react";
import {
  Sparkles,
  Loader2,
  User,
  UserCircle,
  Wand2,
  Check,
  RotateCcw,
  ZoomIn,
  X,
} from "lucide-react";
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
import Image from "next/image";

interface AIAvatarDialogProps {
  profileId: string;
  displayName?: string;
  currentAvatarUrl?: string | null;
  onAvatarGenerated: (url: string) => void;
  disabled?: boolean;
}

type AvatarStyle = "male" | "female" | "neutral" | "custom";
type DialogMode = "selection" | "preview";

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

// Quick refinement presets
const REFINEMENT_PRESETS = [
  { label: "Zoom on face", prompt: "Zoom in closer on the face, making it larger and more prominent in the frame" },
  { label: "More vibrant", prompt: "Make the colors more vibrant and saturated" },
  { label: "Softer look", prompt: "Make it softer and more dreamy with gentle lighting" },
  { label: "Add warmth", prompt: "Add warmer sunset tones and golden lighting" },
];

export function AIAvatarDialog({
  profileId,
  displayName,
  currentAvatarUrl,
  onAvatarGenerated,
  disabled,
}: AIAvatarDialogProps) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("selection");
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("neutral");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Reset dialog state when closing
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset to selection mode but keep style preference
      setMode("selection");
      setPreviewUrl(null);
      setError(null);
      setRefinementPrompt("");
      setIsZoomed(false);
    }
  }, []);

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

      // Show preview instead of closing
      setPreviewUrl(data.imageUrl);
      setMode("preview");
    } catch (err) {
      console.error("AI avatar generation error:", err);
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  // Refine the currently previewed image
  const handleRefine = async (promptOverride?: string) => {
    const imageToRefine = previewUrl || currentAvatarUrl;
    const prompt = promptOverride || refinementPrompt.trim();
    if (!imageToRefine || !prompt) return;

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "avatar",
          entityId: profileId,
          existingImageUrl: imageToRefine,
          refinementPrompt: prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to refine avatar");
      }

      // Update preview with refined result
      setPreviewUrl(data.imageUrl);
      setRefinementPrompt("");
    } catch (err) {
      console.error("AI avatar refinement error:", err);
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  // Accept the current preview
  const handleAccept = () => {
    if (previewUrl) {
      onAvatarGenerated(previewUrl);
      handleOpenChange(false);
    }
  };

  // Go back to style selection to try again
  const handleRedo = () => {
    setMode("selection");
    setPreviewUrl(null);
    setError(null);
    setRefinementPrompt("");
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
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
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
          {mode === "selection" ? (
            <>
              {/* SELECTION MODE */}
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
                      disabled={isGenerating}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all",
                        "hover:bg-accent active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
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
                      disabled={isGenerating}
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
                  onClick={() => handleOpenChange(false)}
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
            </>
          ) : (
            <>
              {/* PREVIEW MODE */}
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  {t("avatarDialog.previewTitle")}
                </DialogTitle>
                <DialogDescription>{t("avatarDialog.previewDescription")}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Large Preview Image */}
                {previewUrl && (
                  <div className="flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsZoomed(true)}
                      className="relative group cursor-zoom-in"
                      disabled={isGenerating}
                    >
                      <div className="relative w-48 h-48 rounded-full overflow-hidden ring-4 ring-primary/20">
                        <Image
                          src={previewUrl}
                          alt="Generated avatar preview"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                        {isGenerating && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {t("avatarDialog.clickToZoom")}
                    </p>
                  </div>
                )}

                {/* Quick Refinement Presets */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("avatarDialog.quickRefine")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {REFINEMENT_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleRefine(preset.prompt)}
                        disabled={isGenerating}
                        className="px-3 py-1.5 text-xs rounded-full border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Refinement */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refinementPrompt}
                      onChange={(e) => setRefinementPrompt(e.target.value)}
                      placeholder={t("avatarDialog.customRefinePlaceholder")}
                      className="flex-1 px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm"
                      disabled={isGenerating}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && refinementPrompt.trim()) {
                          handleRefine();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() => handleRefine()}
                      disabled={isGenerating || !refinementPrompt.trim()}
                      variant="outline"
                      size="sm"
                      className="border-violet-500/30 text-violet-400 hover:bg-violet-500/20"
                    >
                      <Wand2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                    {error}
                  </p>
                )}
              </div>

              {/* Preview Actions */}
              <div className="flex gap-2 justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRedo}
                  disabled={isGenerating}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {t("avatarDialog.tryAgain")}
                </Button>
                <Button
                  type="button"
                  onClick={handleAccept}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Check className="w-4 h-4" />
                  {t("avatarDialog.useThis")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Zoom Overlay */}
      {isZoomed && previewUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsZoomed(false)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => setIsZoomed(false)}
          >
            <X className="w-6 h-6" />
          </button>
          <div className="relative max-w-[90vw] max-h-[90vh] aspect-square">
            <Image
              src={previewUrl}
              alt="Generated avatar full size"
              fill
              className="object-contain rounded-lg"
              unoptimized
            />
          </div>
        </div>
      )}
    </>
  );
}
