"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Link as LinkIcon,
  Sparkles,
  ImageIcon,
  Loader2,
  X,
  Check,
  Upload,
  Wand2,
  ChevronDown,
  ChevronUp,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { validateMediaFile, ALLOWED_MEDIA_TYPES } from "@/lib/media-utils";

// Style presets for AI image generation
type StylePreset = "artistic" | "futuristic" | "realistic" | "nature" | "custom";

interface PresetConfig {
  id: StylePreset;
  labelKey: string;
  getPrompt: (title: string) => string;
}

const STYLE_PRESETS: PresetConfig[] = [
  {
    id: "artistic",
    labelKey: "presetArtistic",
    getPrompt: (title: string) => `Create a vibrant, eye-catching event poster background for "${title || "an event"}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Đà Lạt, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,
  },
  {
    id: "futuristic",
    labelKey: "presetFuturistic",
    getPrompt: (title: string) => `Create a futuristic, high-tech event poster background for "${title || "an event"}".

Style: Cyberpunk aesthetic with neon accents, holographic elements, and sleek geometric shapes.
Colors: Deep blues, electric purples, cyan highlights, and subtle pink/magenta glows.
Elements: Abstract digital grids, light trails, glowing particles, circuit-like patterns.
Mood: Cutting-edge, innovative, forward-thinking, high-energy.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,
  },
  {
    id: "realistic",
    labelKey: "presetRealistic",
    getPrompt: (title: string) => `Create a photorealistic event poster background for "${title || "an event"}".

Style: Ultra-realistic photography style, HDR quality, professional lighting.
Setting: An elegant venue or scenic location that matches the event theme.
Technical: Sharp details, natural depth of field, cinematic color grading.
Mood: Professional, polished, premium quality.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,
  },
  {
    id: "nature",
    labelKey: "presetNature",
    getPrompt: (title: string) => `Create an organic, nature-inspired event poster background for "${title || "an event"}".

Style: Botanical and natural aesthetic with flowing organic shapes.
Elements: Lush foliage, flowers, natural textures, earthy tones with pops of vibrant color.
Colors: Greens, terracotta, warm earth tones, soft pastels.
Mood: Fresh, organic, sustainable, harmonious with nature.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,
  },
  {
    id: "custom",
    labelKey: "presetCustom",
    getPrompt: (title: string) => `Create an event poster background for "${title || "an event"}".

Style: [Describe your preferred style]
Colors: [Specify color palette]
Elements: [List visual elements you want]
Mood: [Describe the atmosphere]
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,
  },
];

type TitlePosition = "top" | "middle" | "bottom";

interface FlyerBuilderProps {
  title: string;
  onTitleChange: (title: string) => void;
  imageUrl: string | null;
  onImageChange: (url: string | null, file?: File) => void;
  titlePosition?: TitlePosition;
  onTitlePositionChange?: (position: TitlePosition) => void;
}

// Generate default prompt from event data (using artistic preset)
function generateDefaultPrompt(title: string): string {
  return STYLE_PRESETS[0].getPrompt(title);
}

export function FlyerBuilder({
  title,
  onTitleChange,
  imageUrl,
  onImageChange,
  titlePosition = "bottom",
  onTitlePositionChange,
}: FlyerBuilderProps) {
  const t = useTranslations("flyerBuilder");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>("artistic");
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(previewUrl);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  const revokeExistingBlobUrl = useCallback(() => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateMediaFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (!file.type.startsWith("image/")) {
        setError(t("imagesOnly"));
        return;
      }
      revokeExistingBlobUrl();
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      onImageChange(objectUrl, file);
    },
    [onImageChange, revokeExistingBlobUrl]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleLoadUrl = async () => {
    if (!urlInput.trim()) return;
    setError(null);
    setIsLoadingUrl(true);

    try {
      const url = new URL(urlInput.trim());
      if (!url.protocol.startsWith("http")) throw new Error();

      const img = new Image();
      img.onload = () => {
        revokeExistingBlobUrl();
        setPreviewUrl(urlInput.trim());
        onImageChange(urlInput.trim());
        setIsLoadingUrl(false);
        setShowUrlInput(false);
        setUrlInput("");
      };
      img.onerror = () => {
        setError(t("invalidImage"));
        setIsLoadingUrl(false);
      };
      img.src = urlInput.trim();
    } catch {
      setError(t("invalidUrl"));
      setIsLoadingUrl(false);
    }
  };

  // Open prompt editor with pre-generated prompt
  const handleOpenPromptEditor = () => {
    setError(null);
    setPrompt(generateDefaultPrompt(title));
    setShowPromptEditor(true);
    setShowUrlInput(false);
  };

  // Actually generate the image with the current prompt
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(t("promptEmpty"));
      return;
    }
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate-flyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), customPrompt: prompt.trim() }),
      });

      if (!response.ok) {
        // Try to parse JSON response, but handle non-JSON responses (e.g., from API gateway)
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || t("generationFailed"));
        } else {
          // Non-JSON response (likely from API gateway)
          const text = await response.text();
          if (response.status === 413 || text.toLowerCase().includes("too large")) {
            throw new Error("Request too large. Try a shorter prompt.");
          }
          throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`);
        }
      }

      const data = await response.json();
      revokeExistingBlobUrl();
      setPreviewUrl(data.imageUrl);
      onImageChange(data.imageUrl);
      setShowPromptEditor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    onImageChange(null);
    setUrlInput("");
    setError(null);
    setShowRefinement(false);
    setRefinementPrompt("");
  };

  // Convert image URL to base64 (client-side fetch for external URLs)
  const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(",")[1];
          resolve({ base64, mimeType });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Refine existing image with AI
  const handleRefine = async () => {
    if (!previewUrl || !refinementPrompt.trim()) return;
    setError(null);
    setIsGenerating(true);

    try {
      const imageData = await fetchImageAsBase64(previewUrl);

      const requestBody: Record<string, string | undefined> = {
        context: "event-cover",
        refinementPrompt: refinementPrompt.trim(),
      };

      if (imageData) {
        requestBody.imageBase64 = imageData.base64;
        requestBody.imageMimeType = imageData.mimeType;
      } else if (previewUrl.startsWith("blob:")) {
        // Blob URL failed to convert - shouldn't happen but handle gracefully
        throw new Error("Unable to process local image. Try uploading again.");
      } else {
        requestBody.existingImageUrl = previewUrl;
      }

      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        // Try to parse JSON response, but handle non-JSON responses (e.g., from API gateway)
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || t("generationFailed"));
        } else {
          // Non-JSON response (likely from API gateway)
          const text = await response.text();
          if (response.status === 413 || text.toLowerCase().includes("too large")) {
            throw new Error("Image is too large to refine. Try uploading a smaller image or using the AI generation instead.");
          }
          throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`);
        }
      }

      const data = await response.json();
      revokeExistingBlobUrl();
      setPreviewUrl(data.imageUrl);
      onImageChange(data.imageUrl);
      setRefinementPrompt("");
      setShowRefinement(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const hasImage = !!previewUrl;

  return (
    <div className="space-y-3">
      {/* Preview area - click to upload */}
      <div
        className={cn(
          "relative aspect-[2/1] rounded-lg overflow-hidden bg-muted/50 border-2 transition-all",
          isDragOver ? "border-primary border-dashed" : "border-muted-foreground/20",
          !hasImage && "cursor-pointer hover:border-muted-foreground/40"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={!hasImage ? () => fileInputRef.current?.click() : undefined}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Safe zone indicator - shows where title will NOT cover */}
        {!hasImage && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Shaded zones showing where title will appear */}
            {titlePosition === "top" && (
              <div className="absolute top-0 inset-x-0 h-[52px] bg-muted-foreground/10 border-b-2 border-dashed border-muted-foreground/30" />
            )}
            {titlePosition === "middle" && (
              <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-[52px] bg-muted-foreground/10 border-y-2 border-dashed border-muted-foreground/30" />
            )}
            {titlePosition === "bottom" && (
              <div className="absolute bottom-0 inset-x-0 h-[52px] bg-muted-foreground/10 border-t-2 border-dashed border-muted-foreground/30" />
            )}
          </div>
        )}

        {/* Title input - position varies based on titlePosition */}
        <div
          className={cn(
            "absolute inset-x-0 p-3",
            titlePosition === "top" && "top-0",
            titlePosition === "middle" && "top-1/2 -translate-y-1/2",
            titlePosition === "bottom" && "bottom-0"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t("eventTitlePlaceholder")}
            className={cn(
              "text-lg font-semibold",
              hasImage
                ? "bg-black/60 backdrop-blur-sm border-white/20 text-white placeholder:text-white/60"
                : "bg-background"
            )}
          />
        </div>

        {/* Clear button */}
        {hasImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Loading overlay */}
        {(isGenerating || isLoadingUrl) && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Actions - minimal icon buttons or expanded editors */}
      <div className="space-y-3">
        {showPromptEditor ? (
          /* AI Prompt Editor */
          <div className="space-y-3">
            {/* Style Presets */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t("stylePreset")}
              </label>
              <div className="flex flex-wrap gap-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      setPrompt(preset.getPrompt(title));
                    }}
                    disabled={isGenerating}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-full border transition-colors",
                      selectedPreset === preset.id
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-input"
                    )}
                  >
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("promptLabel")}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("promptPlaceholder")}
                rows={8}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {t("promptHint")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPromptEditor(false);
                  setPrompt("");
                  setSelectedPreset("artistic");
                  setError(null);
                }}
                disabled={isGenerating}
              >
                {t("cancel")}
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {t("generate")}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : showUrlInput ? (
          /* URL Input */
          <div className="flex gap-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://..."
              className="flex-1 h-9"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleLoadUrl()}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={() => {
                setShowUrlInput(false);
                setUrlInput("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 shrink-0"
              onClick={handleLoadUrl}
              disabled={!urlInput.trim() || isLoadingUrl}
            >
              {isLoadingUrl ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </Button>
          </div>
        ) : (
          /* Default labeled buttons */
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || isLoadingUrl}
            >
              <Upload className="w-4 h-4" />
              Upload
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(true)}
              disabled={isGenerating || isLoadingUrl}
            >
              <LinkIcon className="w-4 h-4" />
              Link
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenPromptEditor}
              disabled={isGenerating || isLoadingUrl}
            >
              <Sparkles className="w-4 h-4" />
              AI
            </Button>

            {/* Title position picker */}
            {onTitlePositionChange && (
              <div className="flex items-center gap-1 ml-auto border rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => onTitlePositionChange("top")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    titlePosition === "top"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  title={t("titlePositionTop")}
                >
                  <AlignVerticalJustifyStart className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onTitlePositionChange("middle")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    titlePosition === "middle"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  title={t("titlePositionMiddle")}
                >
                  <AlignVerticalJustifyCenter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onTitlePositionChange("bottom")}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    titlePosition === "bottom"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                  title={t("titlePositionBottom")}
                >
                  <AlignVerticalJustifyEnd className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Refinement section - only when image exists */}
        {hasImage && !showPromptEditor && !showUrlInput && (
          <>
            <button
              type="button"
              onClick={() => setShowRefinement(!showRefinement)}
              disabled={isGenerating || isLoadingUrl}
              className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-sm disabled:opacity-50"
            >
              <span className="flex items-center gap-2 text-violet-400">
                <Wand2 className="w-4 h-4" />
                {t("refineImage")}
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
                  placeholder={t("refinementPlaceholder")}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm resize-none"
                  disabled={isGenerating || isLoadingUrl}
                />
                <Button
                  type="button"
                  onClick={handleRefine}
                  disabled={isGenerating || isLoadingUrl || !refinementPrompt.trim()}
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
                      {t("applyRefinement")}
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Error - only when needed */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={[...ALLOWED_MEDIA_TYPES.image, ...ALLOWED_MEDIA_TYPES.gif].join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
