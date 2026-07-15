"use client";

import { useState } from "react";
import {
  Loader2,
  ImageIcon,
  Sparkles,
  Wand2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ImageVersionHistory } from "@/components/ui/image-version-history";
import { cn } from "@/lib/utils";
import { generateImageViaQueue, ImageJobError } from "@/lib/ai/image-job-client";
import type { ImageVersionContentType, ImageVersionFieldName } from "@/lib/types";

export type ImageContext = "event-cover" | "blog-cover" | "avatar" | "organizer-logo";

interface AIImageGeneratorProps {
  /** Context determines prompt template and storage bucket */
  context: ImageContext;
  /** Title/name for the subject (used in default prompt) */
  title?: string;
  /** Additional content for context (used in blog-cover) */
  content?: string;
  /** Entity ID for file organization (eventId, userId, etc.) */
  entityId?: string;
  /** Current image URL */
  currentImageUrl?: string | null;
  /** Callback when image changes */
  onImageChange: (url: string) => void;
  /** Aspect ratio class for preview (default: aspect-video) */
  aspectRatio?: string;
  /** Whether to show the image preview */
  showPreview?: boolean;
  /** Custom class for the container */
  className?: string;
  /** Disable the component */
  disabled?: boolean;
}

// Default prompts for each context (shown when customizing)
const DEFAULT_PROMPTS: Record<ImageContext, (title: string, content?: string) => string> = {
  "event-cover": (title) => `Create a vibrant, eye-catching event poster background for "${title}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Đà Lạt, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`,

  "blog-cover": (title, content) => `Create an abstract, artistic cover image for: ${title}

Context: ${content?.slice(0, 200) || "A blog post about technology and community events"}

Style guidelines:
- Modern, clean, tech-forward aesthetic
- Purple and blue gradient background
- Abstract geometric shapes or flowing lines
- NO text, NO lettering, NO words
- Landscape orientation (16:9 aspect ratio)`,

  avatar: (description) => `Create a stylized, artistic avatar portrait.

Subject: ${description || "A friendly, approachable person"}
Style: Modern digital art, clean lines, vibrant colors
Important:
- Square format (1:1 aspect ratio)
- NO text or lettering
- Suitable for a profile picture`,

  "organizer-logo": (name) => `Create a minimal, modern logo design for "${name}".

Style: Clean, geometric, modern brand identity
Important:
- Square format (1:1 aspect ratio)
- Simple, recognizable shape
- NO text or company name
- Abstract/symbolic representation`,
};

// Map context to version tracking types
function getVersionTypes(context: ImageContext): {
  contentType: ImageVersionContentType;
  fieldName: ImageVersionFieldName;
} | null {
  switch (context) {
    case "event-cover":
      return { contentType: "event", fieldName: "cover_image" };
    case "blog-cover":
      return { contentType: "blog", fieldName: "cover_image" };
    case "avatar":
      return { contentType: "profile", fieldName: "avatar" };
    case "organizer-logo":
      return { contentType: "organizer", fieldName: "logo" };
    default:
      return null;
  }
}

export function AIImageGenerator({
  context,
  title = "",
  content,
  entityId,
  currentImageUrl,
  onImageChange,
  aspectRatio = "aspect-video",
  showPreview = true,
  className,
  disabled = false,
}: AIImageGeneratorProps) {
  const tCommon = useTranslations("common");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomizePrompt, setShowCustomizePrompt] = useState(false);
  const [showRefinement, setShowRefinement] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");

  const buildDefaultPrompt = () => DEFAULT_PROMPTS[context](title, content);

  // Map queue error codes to translated messages
  const describeError = (err: unknown, fallback: string) => {
    const codeKeys: Record<string, string> = {
      worker_offline: "aiWorkerOffline",
      rate_limit_unavailable: "aiWorkerOffline",
      context_unavailable: "aiWorkerOffline",
      refine_unavailable: "aiRefineUnavailable",
      too_many_pending: "aiTooManyPending",
      timeout: "aiTimeout",
      generation_failed: "aiGenerationFailed",
    };
    if (err instanceof ImageJobError && err.code && codeKeys[err.code]) {
      return tCommon(codeKeys[err.code]);
    }
    return err instanceof Error ? err.message : fallback;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const payload: Record<string, string | undefined> = {
        context,
        title,
        content,
        entityId,
      };

      if (showCustomizePrompt && customPrompt.trim()) {
        payload.customPrompt = customPrompt.trim();
      }

      // Enqueued on the local image worker; resolves when the job completes
      const imageUrl = await generateImageViaQueue(payload);
      onImageChange(imageUrl);
    } catch (err) {
      console.error("Failed to generate image:", err);
      setError(describeError(err, tCommon("aiGenerationFailed")));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!currentImageUrl || !refinementPrompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const imageUrl = await generateImageViaQueue({
        context,
        entityId,
        existingImageUrl: currentImageUrl,
        refinementPrompt: refinementPrompt.trim(),
      });

      onImageChange(imageUrl);
      setRefinementPrompt("");
      setShowRefinement(false);
    } catch (err) {
      console.error("Failed to refine image:", err);
      setError(describeError(err, tCommon("aiGenerationFailed")));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Error display */}
      {error && (
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Image preview - clickable to zoom */}
      {showPreview && (
        <>
          {currentImageUrl ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className={cn(
                "relative rounded-lg overflow-hidden w-full cursor-zoom-in group",
                aspectRatio
              )}
              disabled={disabled}
            >
              <Image
                src={currentImageUrl}
                alt="Generated image"
                fill
                className="object-cover transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                  Click to preview
                </span>
              </div>
            </button>
          ) : (
            <div
              className={cn(
                "rounded-lg bg-muted flex items-center justify-center",
                aspectRatio
              )}
            >
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            </div>
          )}

          <ImageLightbox
            src={currentImageUrl || ""}
            alt="Image preview"
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
          />
        </>
      )}

      {/* Customize prompt toggle */}
      <button
        type="button"
        onClick={() => {
          if (!showCustomizePrompt && !customPrompt) {
            setCustomPrompt(buildDefaultPrompt());
          }
          setShowCustomizePrompt(!showCustomizePrompt);
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm"
        disabled={disabled || isGenerating}
      >
        <span className="text-muted-foreground">Customize prompt</span>
        {showCustomizePrompt ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {showCustomizePrompt && (
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs font-mono resize-none"
          disabled={disabled || isGenerating}
        />
      )}

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={disabled || isGenerating}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm disabled:opacity-50"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {currentImageUrl ? "Regenerate with AI" : "Generate with AI"}
      </button>

      {/* Queue wait hint — generation runs on the local worker (1-3 min) */}
      {isGenerating && (
        <p className="text-xs text-muted-foreground text-center">
          {tCommon("aiQueueWait")}
        </p>
      )}

      {/* Refinement - collapsible, only when image exists */}
      {currentImageUrl && (
        <>
          <button
            type="button"
            onClick={() => setShowRefinement(!showRefinement)}
            disabled={disabled || isGenerating}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-sm disabled:opacity-50"
          >
            <span className="flex items-center gap-2 text-violet-400">
              <Wand2 className="h-4 w-4" />
              Refine this image
            </span>
            {showRefinement ? (
              <ChevronUp className="h-4 w-4 text-violet-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-violet-400" />
            )}
          </button>

          {showRefinement && (
            <div className="space-y-2 pl-2 border-l-2 border-violet-500/30">
              <textarea
                value={refinementPrompt}
                onChange={(e) => setRefinementPrompt(e.target.value)}
                placeholder="e.g., Add more purple tones, make it more abstract..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm resize-none"
                disabled={disabled || isGenerating}
              />
              <button
                type="button"
                onClick={handleRefine}
                disabled={disabled || isGenerating || !refinementPrompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-violet-600 text-white hover:bg-violet-700 transition-colors text-sm disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Apply Refinement
              </button>
            </div>
          )}
        </>
      )}

      {/* Version history - only show if entityId is provided */}
      {entityId && currentImageUrl && (() => {
        const versionTypes = getVersionTypes(context);
        if (!versionTypes) return null;
        return (
          <ImageVersionHistory
            contentType={versionTypes.contentType}
            contentId={entityId}
            fieldName={versionTypes.fieldName}
            currentImageUrl={currentImageUrl}
            onRestore={onImageChange}
            disabled={disabled || isGenerating}
          />
        );
      })()}
    </div>
  );
}
