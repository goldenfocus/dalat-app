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
import { cn } from "@/lib/utils";

interface AIOrganizerLogoDialogProps {
  organizerId?: string;
  organizerName: string;
  currentLogoUrl?: string | null;
  onLogoGenerated: (url: string) => void;
  disabled?: boolean;
  /** AI context for image generation (default: "organizer-logo") */
  context?: "organizer-logo" | "venue-logo";
}

type DialogMode = "setup" | "generating" | "preview";

// Style presets for logo generation
type StylePreset = "geometric" | "modern" | "vintage" | "playful" | "custom";

interface PresetConfig {
  id: StylePreset;
  label: string;
  getPrompt: (name: string, context: "organizer-logo" | "venue-logo") => string;
}

const STYLE_PRESETS: PresetConfig[] = [
  {
    id: "geometric",
    label: "Geometric",
    getPrompt: (name, context) => {
      const entityType = context === "venue-logo" ? "venue" : "organization";
      return `Create a clean, geometric logo for "${name}" (a ${entityType}).

Style: Minimalist geometric shapes, clean lines, modern corporate identity.
Colors: Professional palette with 2-3 colors max. Consider deep blues, teals, or earth tones.
Elements: Abstract geometric forms that suggest the business type without being literal.
Important: Do NOT include any text or lettering. Create only the visual mark/icon.
Format: Square aspect ratio (1:1), suitable for profile pictures and favicons.`;
    },
  },
  {
    id: "modern",
    label: "Modern",
    getPrompt: (name, context) => {
      const entityType = context === "venue-logo" ? "venue" : "organization";
      return `Create a modern, sleek logo for "${name}" (a ${entityType}).

Style: Contemporary design with subtle gradients, smooth curves, professional look.
Colors: Modern palette - consider gradients from purple to blue, or warm sunset tones.
Elements: Flowing shapes, elegant curves, sophisticated visual identity.
Important: Do NOT include any text or lettering. Create only the visual mark/icon.
Format: Square aspect ratio (1:1), suitable for profile pictures and favicons.`;
    },
  },
  {
    id: "vintage",
    label: "Vintage",
    getPrompt: (name, context) => {
      const entityType = context === "venue-logo" ? "venue" : "organization";
      return `Create a vintage-inspired logo for "${name}" (a ${entityType}).

Style: Classic, timeless design with retro charm. Hand-crafted aesthetic.
Colors: Warm, muted tones - browns, creams, deep reds, forest greens.
Elements: Classic emblems, heritage-style marks, artisan craftsmanship feel.
Important: Do NOT include any text or lettering. Create only the visual mark/icon.
Format: Square aspect ratio (1:1), suitable for profile pictures and favicons.`;
    },
  },
  {
    id: "playful",
    label: "Playful",
    getPrompt: (name, context) => {
      const entityType = context === "venue-logo" ? "venue" : "organization";
      return `Create a playful, friendly logo for "${name}" (a ${entityType}).

Style: Fun, approachable design with rounded shapes and friendly feel.
Colors: Vibrant, cheerful palette - bright colors that feel welcoming and energetic.
Elements: Rounded forms, organic shapes, approachable and inviting visual style.
Important: Do NOT include any text or lettering. Create only the visual mark/icon.
Format: Square aspect ratio (1:1), suitable for profile pictures and favicons.`;
    },
  },
  {
    id: "custom",
    label: "Custom",
    getPrompt: (name, context) => {
      const entityType = context === "venue-logo" ? "venue" : "organization";
      return `Create a logo for "${name}" (a ${entityType}).

Style: [Describe your preferred style]
Colors: [Specify color palette]
Elements: [List visual elements you want]
Important: Do NOT include any text or lettering. Create only the visual mark/icon.
Format: Square aspect ratio (1:1), suitable for profile pictures and favicons.`;
    },
  },
];

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
  context = "organizer-logo",
}: AIOrganizerLogoDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("setup");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // New: Style preset and prompt state
  const [selectedPreset, setSelectedPreset] = useState<StylePreset>("geometric");
  const [prompt, setPrompt] = useState("");

  // Initialize prompt when dialog opens
  const initializePrompt = useCallback(() => {
    const preset = STYLE_PRESETS.find((p) => p.id === "geometric") || STYLE_PRESETS[0];
    setPrompt(preset.getPrompt(organizerName, context));
  }, [organizerName, context]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // Reset to setup mode and initialize prompt
      setMode("setup");
      setPreviewUrl(null);
      setError(null);
      setRefinementPrompt("");
      setSelectedPreset("geometric");
      initializePrompt();
    } else {
      setMode("setup");
      setPreviewUrl(null);
      setError(null);
      setRefinementPrompt("");
    }
  }, [initializePrompt]);

  const handlePresetChange = (presetId: StylePreset) => {
    setSelectedPreset(presetId);
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setPrompt(preset.getPrompt(organizerName, context));
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError("Please enter a prompt");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setMode("generating");

    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          title: organizerName,
          customPrompt: prompt.trim(),
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
          context,
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
    // Go back to setup mode to let user adjust prompt
    setPreviewUrl(null);
    setError(null);
    setRefinementPrompt("");
    setMode("setup");
  };

  return (
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
          Generate AI Logo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {mode === "setup" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Generate AI Logo
              </DialogTitle>
              <DialogDescription>
                Customize the style for your logo
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Style Presets */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Style</label>
                <div className="flex flex-wrap gap-2">
                  {STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetChange(preset.id)}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-colors",
                        selectedPreset === preset.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-input"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prompt Editor */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the logo you want..."
                  rows={6}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Edit the prompt to customize the style
                </p>
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
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Generate
              </Button>
            </div>
          </>
        ) : mode === "generating" ? (
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
