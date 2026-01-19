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
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { cn } from "@/lib/utils";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCustomizePrompt, setShowCustomizePrompt] = useState(false);
  const [showRefinement, setShowRefinement] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");

  const buildDefaultPrompt = () => DEFAULT_PROMPTS[context](title, content);

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

      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onImageChange(data.imageUrl);
    } catch (err) {
      console.error("Failed to generate image:", err);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!currentImageUrl || !refinementPrompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          entityId,
          existingImageUrl: currentImageUrl,
          refinementPrompt: refinementPrompt.trim(),
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      onImageChange(data.imageUrl);
      setRefinementPrompt("");
      setShowRefinement(false);
    } catch (err) {
      console.error("Failed to refine image:", err);
      setError(err instanceof Error ? err.message : "Refinement failed");
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
    </div>
  );
}
