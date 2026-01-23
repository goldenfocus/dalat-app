"use client";

import { useState, useRef, useCallback } from "react";
import {
  ImageIcon,
  X,
  Upload,
  Loader2,
  Link as LinkIcon,
  Sparkles,
  Wand2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  validateMediaFile,
  isVideoUrl,
  ALL_ALLOWED_TYPES,
  needsConversion,
} from "@/lib/media-utils";
import { convertIfNeeded } from "@/lib/media-conversion";

interface EventMediaUploadProps {
  eventId: string;
  eventTitle?: string;
  currentMediaUrl: string | null;
  onMediaChange: (url: string | null) => void;
  /** Auto-save image_url to database on upload/generate (default: true) */
  autoSave?: boolean;
}

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

// Generate default prompt from event data (using artistic preset)
function generateDefaultPrompt(title: string): string {
  return STYLE_PRESETS[0].getPrompt(title);
}

export function EventMediaUpload({
  eventId,
  eventTitle,
  currentMediaUrl,
  onMediaChange,
  autoSave = true,
}: EventMediaUploadProps) {
  const t = useTranslations("flyerBuilder");

  const [showSaved, setShowSaved] = useState(false);

  // Auto-save image_url to database
  const saveToDatabase = async (url: string | null) => {
    if (!autoSave) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({ image_url: url })
        .eq("id", eventId);

      if (error) {
        console.error("Auto-save failed:", error);
      } else {
        // Show brief "Saved" indicator
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } catch (err) {
      console.error("Auto-save error:", err);
    }
  };

  // Wrapper that saves and notifies parent
  const handleMediaUpdate = async (url: string | null) => {
    onMediaChange(url);
    await saveToDatabase(url);
  };
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentMediaUrl);
  const [previewIsVideo, setPreviewIsVideo] = useState<boolean>(
    isVideoUrl(currentMediaUrl)
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertStatus, setConvertStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Link input state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  // AI generation state
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>("artistic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");

  const uploadMedia = async (file: File) => {
    setError(null);
    setConvertStatus(null);

    const validationError = validateMediaFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setPreviewIsVideo(
      file.type.startsWith("video/") || file.name.toLowerCase().endsWith(".mov")
    );

    let fileToUpload = file;

    // Convert if needed (HEIC → JPEG, MOV → MP4)
    if (needsConversion(file)) {
      setIsConverting(true);
      try {
        fileToUpload = await convertIfNeeded(file, setConvertStatus);
        // Update preview with converted file
        URL.revokeObjectURL(objectUrl);
        const newObjectUrl = URL.createObjectURL(fileToUpload);
        setPreviewUrl(newObjectUrl);
        setPreviewIsVideo(fileToUpload.type.startsWith("video/"));
      } catch (err) {
        console.error("Conversion error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to convert file"
        );
        setPreviewUrl(currentMediaUrl);
        setPreviewIsVideo(isVideoUrl(currentMediaUrl));
        setIsConverting(false);
        return;
      } finally {
        setIsConverting(false);
        setConvertStatus(null);
      }
    }

    setIsUploading(true);

    try {
      // Use server-side upload API to bypass RLS issues
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("eventId", eventId);

      const response = await fetch("/api/upload/event-media", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data.error || "Upload failed";
        if (message.includes("authorized") || message.includes("permission")) {
          setError("Permission denied. You may not have rights to edit this event.");
        } else {
          setError(`Failed to upload: ${message}`);
        }
        setPreviewUrl(currentMediaUrl);
        setPreviewIsVideo(isVideoUrl(currentMediaUrl));
        return;
      }

      // Update preview to permanent URL before revoking blob
      setPreviewUrl(data.url);
      setPreviewIsVideo(isVideoUrl(data.url));
      await handleMediaUpdate(data.url);
    } catch (err: unknown) {
      console.error("Upload error:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to upload: ${message}`);
      setPreviewUrl(currentMediaUrl);
      setPreviewIsVideo(isVideoUrl(currentMediaUrl));
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMedia(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        uploadMedia(file);
      }
    },
    [eventId, currentMediaUrl]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleRemove = async () => {
    if (!currentMediaUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Extract path from URL
      const oldPath = currentMediaUrl.split("/event-media/")[1];
      if (oldPath) {
        await supabase.storage.from("event-media").remove([oldPath]);
      }

      setPreviewUrl(null);
      setPreviewIsVideo(false);
      await handleMediaUpdate(null);
    } catch (err) {
      console.error("Remove error:", err);
      setError("Failed to remove. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle loading image from URL
  const handleLoadUrl = async () => {
    if (!urlInput.trim()) return;
    setError(null);
    setIsLoadingUrl(true);

    // Capture the URL value at call time to avoid closure issues
    const urlToLoad = urlInput.trim();

    try {
      const url = new URL(urlToLoad);
      if (!url.protocol.startsWith("http")) throw new Error();

      const img = new Image();
      img.onload = async () => {
        setPreviewUrl(urlToLoad);
        setPreviewIsVideo(false);
        await handleMediaUpdate(urlToLoad);
        setIsLoadingUrl(false);
        setShowUrlInput(false);
        setUrlInput("");
      };
      img.onerror = () => {
        setError(t("invalidImage"));
        setIsLoadingUrl(false);
      };
      img.src = urlToLoad;
    } catch {
      setError(t("invalidUrl"));
      setIsLoadingUrl(false);
    }
  };

  // Open prompt editor with pre-generated prompt
  const handleOpenPromptEditor = () => {
    setError(null);
    setPrompt(generateDefaultPrompt(eventTitle || ""));
    setShowPromptEditor(true);
    setShowUrlInput(false);
  };

  // Generate image with AI
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError(t("promptEmpty"));
      return;
    }
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "event-cover",
          title: eventTitle?.trim() || "",
          customPrompt: prompt.trim(),
          entityId: eventId,
        }),
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
      setPreviewUrl(data.imageUrl);
      setPreviewIsVideo(false);
      await handleMediaUpdate(data.imageUrl);
      setShowPromptEditor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  // Convert image URL to base64 with compression (client-side fetch works for external URLs)
  const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();

      // Load image to get dimensions
      const img = new Image();
      const imageUrl = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Resize if too large (max 1536px on longest side to keep under API limits)
      const maxSize = 1536;
      let width = img.width;
      let height = img.height;

      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      // Draw resized image to canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(imageUrl);
        return null;
      }
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64 with compression (0.85 quality for JPEG)
      const mimeType = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, 0.85);
      const base64 = dataUrl.split(",")[1];

      URL.revokeObjectURL(imageUrl);
      return { base64, mimeType };
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
      // Try to fetch image as base64 client-side (works for external URLs like Facebook)
      const imageData = await fetchImageAsBase64(previewUrl);

      const requestBody: Record<string, string | undefined> = {
        context: "event-cover",
        entityId: eventId,
        refinementPrompt: refinementPrompt.trim(),
      };

      if (imageData) {
        // Use base64 data (works for external/Facebook URLs)
        requestBody.imageBase64 = imageData.base64;
        requestBody.imageMimeType = imageData.mimeType;
      } else if (previewUrl.startsWith("blob:")) {
        // Blob URLs can't be sent to the server - this means the upload didn't complete
        throw new Error("Please wait for the image to finish uploading before refining");
      } else {
        // Fallback to URL (works for our own storage URLs)
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
      setPreviewUrl(data.imageUrl);
      setPreviewIsVideo(false);
      await handleMediaUpdate(data.imageUrl);
      setRefinementPrompt("");
      setShowRefinement(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const isLoading = isUploading || isLoadingUrl || isGenerating || isConverting;

  return (
    <div className="space-y-3">
      {/* Media preview area */}
      <div
        className={cn(
          "relative aspect-[2/1] rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer group",
          isDragOver
            ? "border-primary border-dashed"
            : "border-transparent hover:border-muted-foreground/20"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {previewUrl ? (
          previewIsVideo ? (
            <video
              src={previewUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              autoPlay
            />
          ) : (
            <img
              src={previewUrl}
              alt="Event media"
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-primary/5 gap-2">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Drop an image or video here
            </span>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-white" />
          )}
        </div>

        {/* Remove button on image */}
        {previewUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="absolute top-2 right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Auto-save indicator */}
        {showSaved && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-green-500/90 text-white text-xs font-medium flex items-center gap-1">
            <Check className="w-3 h-3" />
            Saved
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
            {convertStatus && (
              <span className="text-sm text-white">{convertStatus}</span>
            )}
          </div>
        )}
      </div>

      {/* Actions - conditionally show editors or buttons */}
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
                      setPrompt(preset.getPrompt(eventTitle || ""));
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
          /* Default buttons */
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(true)}
              disabled={isLoading}
            >
              <LinkIcon className="w-4 h-4" />
              Link
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenPromptEditor}
              disabled={isLoading}
            >
              <Sparkles className="w-4 h-4" />
              AI
            </Button>
          </div>
        )}

        {/* Refinement section - only when image exists */}
        {previewUrl && !previewIsVideo && !showPromptEditor && !showUrlInput && (
          <>
            <button
              type="button"
              onClick={() => setShowRefinement(!showRefinement)}
              disabled={isLoading}
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
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  onClick={handleRefine}
                  disabled={isLoading || !refinementPrompt.trim()}
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

      <input
        ref={fileInputRef}
        type="file"
        accept={ALL_ALLOWED_TYPES.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}