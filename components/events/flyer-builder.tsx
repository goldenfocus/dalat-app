"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  Link as LinkIcon,
  Sparkles,
  ImageIcon,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { validateMediaFile, ALLOWED_MEDIA_TYPES } from "@/lib/media-utils";

type ImageSource = "upload" | "url" | "generate";

interface FlyerBuilderProps {
  title: string;
  onTitleChange: (title: string) => void;
  imageUrl: string | null;
  onImageChange: (url: string | null, file?: File) => void;
  defaultTitle?: string;
}

export function FlyerBuilder({
  title,
  onTitleChange,
  imageUrl,
  onImageChange,
  defaultTitle = "",
}: FlyerBuilderProps) {
  const [source, setSource] = useState<ImageSource>("upload");
  const [urlInput, setUrlInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection/drop for upload mode
  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const validationError = validateMediaFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      // Only allow images for flyer
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setPendingFile(file);
      onImageChange(objectUrl, file);
    },
    [onImageChange]
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

  // Handle URL loading
  const handleLoadUrl = async () => {
    if (!urlInput.trim()) return;

    setError(null);
    setIsLoadingUrl(true);

    try {
      // Basic URL validation
      const url = new URL(urlInput.trim());
      if (!url.protocol.startsWith("http")) {
        throw new Error("URL must start with http:// or https://");
      }

      // Try to load the image to verify it's valid
      const img = new Image();
      img.onload = () => {
        setPreviewUrl(urlInput.trim());
        onImageChange(urlInput.trim());
        setIsLoadingUrl(false);
      };
      img.onerror = () => {
        setError("Could not load image from URL");
        setIsLoadingUrl(false);
      };
      img.src = urlInput.trim();
    } catch {
      setError("Please enter a valid URL");
      setIsLoadingUrl(false);
    }
  };

  // Handle AI generation
  const handleGenerate = async () => {
    if (!title.trim()) {
      setError("Please enter an event title first");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate-flyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate image");
      }

      const data = await response.json();
      setPreviewUrl(data.imageUrl);
      onImageChange(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  // Clear image
  const handleClear = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setPendingFile(null);
    onImageChange(null);
    setUrlInput("");
    setError(null);
  };

  const hasImage = !!previewUrl;

  return (
    <div className="space-y-4">
      {/* Preview area with title overlay */}
      <div
        className={cn(
          "relative aspect-[2/1] rounded-lg overflow-hidden bg-muted/50 border-2 transition-all",
          isDragOver
            ? "border-primary border-dashed"
            : "border-muted-foreground/20",
          source === "upload" && !hasImage && "cursor-pointer hover:border-muted-foreground/40"
        )}
        onDrop={source === "upload" ? handleDrop : undefined}
        onDragOver={source === "upload" ? handleDragOver : undefined}
        onDragLeave={source === "upload" ? handleDragLeave : undefined}
        onClick={
          source === "upload" && !hasImage
            ? () => fileInputRef.current?.click()
            : undefined
        }
      >
        {/* Image or placeholder */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Event flyer preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {source === "upload" && "Click or drop an image"}
              {source === "url" && "Enter a URL below"}
              {source === "generate" && "Generate from your event title"}
            </p>
          </div>
        )}

        {/* Title input overlay */}
        <div className="absolute bottom-0 inset-x-0 p-3">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Event title *"
            className={cn(
              "text-lg font-semibold transition-all",
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

      {/* Source mode selector */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={source === "upload" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("upload")}
          className="flex-1"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload
        </Button>
        <Button
          type="button"
          variant={source === "url" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("url")}
          className="flex-1"
        >
          <LinkIcon className="w-4 h-4 mr-2" />
          URL
        </Button>
        <Button
          type="button"
          variant={source === "generate" ? "default" : "outline"}
          size="sm"
          onClick={() => setSource("generate")}
          className="flex-1"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Generate
        </Button>
      </div>

      {/* Mode-specific content */}
      <div className="min-h-[60px]">
        {source === "upload" && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {hasImage ? "Replace image" : "Choose image"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              JPEG, PNG, WebP, or GIF up to 15MB
            </p>
          </div>
        )}

        {source === "url" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadUrl}
                disabled={isLoadingUrl || !urlInput.trim()}
              >
                {isLoadingUrl ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Enter a direct link to an image
            </p>
          </div>
        )}

        {source === "generate" && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating || !title.trim()}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate flyer from title
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {title.trim()
                ? "AI will create an event poster inspired by your title"
                : "Enter an event title above to generate"}
            </p>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}

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
