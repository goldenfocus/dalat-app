"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Link as LinkIcon,
  Sparkles,
  ImageIcon,
  Loader2,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { validateMediaFile, ALLOWED_MEDIA_TYPES } from "@/lib/media-utils";

interface FlyerBuilderProps {
  title: string;
  onTitleChange: (title: string) => void;
  imageUrl: string | null;
  onImageChange: (url: string | null, file?: File) => void;
}

// Generate default prompt from event data
function generateDefaultPrompt(title: string): string {
  return `Create a vibrant, eye-catching event poster background for "${title || "an event"}".

Style: Modern event flyer aesthetic with warm Vietnamese highland colors.
Setting: Inspired by Da Lat, Vietnam - misty mountains, pine forests, French colonial architecture, flower fields.
Mood: Atmospheric, inviting, energetic yet sophisticated.
Important: Do NOT include any text or lettering in the image. Create only the visual background.
Aspect ratio: 2:1 landscape orientation.`;
}

export function FlyerBuilder({
  title,
  onTitleChange,
  imageUrl,
  onImageChange,
}: FlyerBuilderProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
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
        setError("Images only");
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
        setError("Invalid image");
        setIsLoadingUrl(false);
      };
      img.src = urlInput.trim();
    } catch {
      setError("Invalid URL");
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
      setError("Prompt is empty");
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
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }

      const data = await response.json();
      revokeExistingBlobUrl();
      setPreviewUrl(data.imageUrl);
      onImageChange(data.imageUrl);
      setShowPromptEditor(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
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

        {/* Title input */}
        <div
          className="absolute bottom-0 inset-x-0 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Event title"
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
          <div className="space-y-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={6}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPromptEditor(false);
                  setPrompt("");
                  setError(null);
                }}
                disabled={isGenerating}
              >
                Cancel
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
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate
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
          /* Default icon buttons */
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={() => setShowUrlInput(true)}
            >
              <LinkIcon className="w-4 h-4" />
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9 border-dashed"
              onClick={handleOpenPromptEditor}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </Button>
          </div>
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
