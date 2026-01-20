"use client";

import { useState, useCallback } from "react";
import { Sparkles, Loader2, Check, RotateCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Image from "next/image";

interface AIOrganizerLogoDialogProps {
  organizerId?: string;
  organizerName: string;
  currentLogoUrl?: string | null;
  onLogoGenerated: (url: string) => void;
  disabled?: boolean;
}

type DialogMode = "preview" | "generating";

const REFINEMENT_PRESETS = [
  { label: "More geometric", prompt: "Make it more geometric and minimal" },
  { label: "Softer", prompt: "Make the shapes softer and more rounded" },
  { label: "More vibrant", prompt: "Make the colors more vibrant and bold" },
  { label: "Minimal", prompt: "Simplify and make more minimal" },
];

export function AIOrganizerLogoDialog({
  organizerId,
  organizerName,
  currentLogoUrl,
  onLogoGenerated,
  disabled,
}: AIOrganizerLogoDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("generating");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setMode("generating");
      setPreviewUrl(null);
      setError(null);
      setRefinementPrompt("");
    }
  }, []);

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    setMode("generating");

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "organizer-logo",
          title: organizerName,
          entityId: organizerId,
        }),
      });

      if (!response.ok) {
        // Try to parse JSON response, but handle non-JSON responses (e.g., from API gateway)
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || "Failed to generate logo");
        } else {
          // Non-JSON response (likely from API gateway)
          const text = await response.text();
          if (response.status === 413 || text.toLowerCase().includes("too large")) {
            throw new Error("Request too large. Try a shorter name.");
          }
          throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`);
        }
      }

      const data = await response.json();
      setPreviewUrl(data.imageUrl);
      setMode("preview");
    } catch (err) {
      console.error("AI logo generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate logo");
      setMode("preview");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (promptOverride?: string) => {
    const imageToRefine = previewUrl || currentLogoUrl;
    const prompt = promptOverride || refinementPrompt.trim();
    if (!imageToRefine || !prompt) return;

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "organizer-logo",
          entityId: organizerId,
          existingImageUrl: imageToRefine,
          refinementPrompt: prompt,
        }),
      });

      if (!response.ok) {
        // Try to parse JSON response, but handle non-JSON responses (e.g., from API gateway)
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || "Failed to refine logo");
        } else {
          // Non-JSON response (likely from API gateway)
          const text = await response.text();
          if (response.status === 413 || text.toLowerCase().includes("too large")) {
            throw new Error("Image is too large to refine. Try generating a new logo instead.");
          }
          throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`);
        }
      }

      const data = await response.json();
      setPreviewUrl(data.imageUrl);
      setRefinementPrompt("");
    } catch (err) {
      console.error("AI logo refinement error:", err);
      setError(err instanceof Error ? err.message : "Failed to refine logo");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (previewUrl) {
      onLogoGenerated(previewUrl);
      handleOpenChange(false);
    }
  };

  const handleRedo = () => {
    setPreviewUrl(null);
    setError(null);
    setRefinementPrompt("");
    handleGenerate();
  };

  // Auto-generate when dialog opens
  const handleDialogOpen = (newOpen: boolean) => {
    handleOpenChange(newOpen);
    if (newOpen && !isGenerating) {
      handleGenerate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Generate AI Logo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {mode === "generating" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Generating Logo
              </DialogTitle>
              <DialogDescription>
                Creating a unique logo for {organizerName}...
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">
                This may take 30-60 seconds
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                Logo Preview
              </DialogTitle>
              <DialogDescription>
                Review and refine your AI-generated logo
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Preview */}
              {previewUrl && (
                <div className="flex justify-center">
                  <div className="relative w-48 h-48 rounded-lg overflow-hidden ring-4 ring-primary/20 bg-muted">
                    <Image
                      src={previewUrl}
                      alt="Generated logo preview"
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
                </div>
              )}

              {/* Quick Refinement Presets */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Quick refinements
                </p>
                <div className="flex flex-wrap gap-2">
                  {REFINEMENT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleRefine(preset.prompt)}
                      disabled={isGenerating || !previewUrl}
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
                    placeholder="Describe changes (e.g., 'add blue color')"
                    className="flex-1 px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/50 text-sm"
                    disabled={isGenerating || !previewUrl}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && refinementPrompt.trim()) {
                        handleRefine();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => handleRefine()}
                    disabled={isGenerating || !refinementPrompt.trim() || !previewUrl}
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

            {/* Actions */}
            <div className="flex gap-2 justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleRedo}
                disabled={isGenerating}
                className="flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Generate New
              </Button>
              <Button
                type="button"
                onClick={handleAccept}
                disabled={isGenerating || !previewUrl}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4" />
                Use This Logo
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
