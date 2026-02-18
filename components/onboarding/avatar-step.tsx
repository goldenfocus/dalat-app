"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Sparkles, Loader2, Camera, User, UserCircle, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { AIEnhanceTextarea } from "@/components/ui/ai-enhance-textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage/client";
import { DefaultAvatars } from "./default-avatars";
import { AIAvatarDialog } from "@/components/profile/ai-avatar-dialog";

type AvatarStyle = "male" | "female" | "neutral" | "custom";

interface AvatarStepProps {
  userId: string;
  displayName?: string;
  oauthAvatarUrl?: string | null;
  onComplete: (avatarUrl: string | null) => void;
  onSkip: () => void;
}

export function AvatarStep({
  userId,
  displayName,
  oauthAvatarUrl,
  onComplete,
  onSkip,
}: AvatarStepProps) {
  const t = useTranslations("onboarding");
  const tProfile = useTranslations("profile");
  const [previewUrl, setPreviewUrl] = useState<string | null>(oauthAvatarUrl || null);
  const [selectedDefault, setSelectedDefault] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track if current avatar is AI-generated (to show refine option)
  const [isAIGenerated, setIsAIGenerated] = useState(false);

  // AI Avatar dialog state
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle>("neutral");
  const [customPrompt, setCustomPrompt] = useState("");

  // Multi-stage loading messages for AI generation
  const generationStages = [
    t("avatarStep.generating"),           // "Generating..."
    t("avatarStep.creatingArtwork"),      // "Creating artwork..."
    t("avatarStep.almostThere"),          // "Almost there..."
  ];

  // Progress through stages during generation
  useEffect(() => {
    if (!isGenerating) {
      setGenerationStage(0);
      return;
    }

    const timers = [
      setTimeout(() => setGenerationStage(1), 3000),  // After 3s
      setTimeout(() => setGenerationStage(2), 8000),  // After 8s
    ];

    return () => timers.forEach(clearTimeout);
  }, [isGenerating]);

  const validateFile = (file: File): string | null => {
    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!allowedTypes.includes(file.type)) {
      return tProfile("invalidFileType");
    }
    if (file.size > maxSize) {
      return tProfile("fileTooLarge");
    }
    return null;
  };

  const uploadAvatar = async (blob: File | Blob, filename: string = "avatar.jpg"): Promise<string> => {
    // uploadFile expects a File object — wrap Blob if needed
    const file = blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type });

    const result = await uploadFile("avatars", file, { entityId: userId });
    return result.publicUrl;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSelectedDefault(null);
    setIsAIGenerated(false);
    setIsUploading(true);

    try {
      const publicUrl = await uploadAvatar(file, file.name);
      setPreviewUrl(publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
      setError(tProfile("uploadFailed"));
      setPreviewUrl(oauthAvatarUrl || null);
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(objectUrl);
    }

    e.target.value = "";
  };

  const handleUseOAuth = async () => {
    if (!oauthAvatarUrl) return;

    setError(null);
    setIsUploading(true);

    try {
      // Download OAuth avatar and re-upload to our storage
      const response = await fetch(oauthAvatarUrl);
      const blob = await response.blob();
      const ext = blob.type.split("/")[1] || "jpg";
      const publicUrl = await uploadAvatar(blob, `google-avatar.${ext}`);
      setPreviewUrl(publicUrl);
      setSelectedDefault(null);
      setIsAIGenerated(false);
    } catch (err) {
      console.error("OAuth avatar error:", err);
      // Fall back to using the OAuth URL directly
      setPreviewUrl(oauthAvatarUrl);
      setSelectedDefault(null);
      setIsAIGenerated(false);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateAI = async () => {
    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          style: selectedStyle,
          customPrompt: selectedStyle === "custom" ? customPrompt : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate avatar");
      }

      const { imageUrl } = await response.json();

      // Convert data URL to blob via fetch (handles all formats safely)
      const blobResponse = await fetch(imageUrl);
      const blob = await blobResponse.blob();
      const ext = blob.type.split("/")[1] || "png";
      const publicUrl = await uploadAvatar(blob, `ai-avatar.${ext}`);
      setPreviewUrl(publicUrl);
      setSelectedDefault(null);
      setIsAIGenerated(true);
      setShowAIDialog(false);
      // Reset dialog state for next time
      setSelectedStyle("neutral");
      setCustomPrompt("");
    } catch (err) {
      console.error("AI generation error:", err);
      setError(err instanceof Error ? err.message : t("avatarStep.generationFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectDefault = (src: string) => {
    setSelectedDefault(src);
    setPreviewUrl(src);
    setIsAIGenerated(false);
  };

  // Handler for when AIAvatarDialog refines the avatar
  const handleAvatarRefined = (url: string) => {
    setPreviewUrl(url);
    setIsAIGenerated(true);
  };

  const handleContinue = () => {
    onComplete(previewUrl);
  };

  const isLoading = isUploading || isGenerating;

  return (
    <div className="space-y-8">
      {/* Large preview */}
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "w-32 h-32 rounded-full overflow-hidden bg-muted border-4 border-background shadow-lg",
            "flex items-center justify-center relative"
          )}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t("avatarStep.preview")}
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-16 h-16 text-muted-foreground" />
          )}
          {isLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-full">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Refine button - shows after AI generation */}
        {isAIGenerated && previewUrl && !isLoading && (
          <AIAvatarDialog
            profileId={userId}
            displayName={displayName}
            currentAvatarUrl={previewUrl}
            onAvatarGenerated={handleAvatarRefined}
            initialMode="refine"
            customTrigger={
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                {tProfile("avatarDialog.refineTitle")}
              </button>
            }
          />
        )}
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-3">
        {oauthAvatarUrl && (
          <button
            type="button"
            onClick={handleUseOAuth}
            disabled={isLoading}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
              "hover:bg-accent hover:border-primary/50 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              previewUrl === oauthAvatarUrl ? "border-primary bg-primary/5" : "border-muted"
            )}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden">
              <img src={oauthAvatarUrl} alt="Google" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-medium">{t("avatarStep.useGoogle")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
            "hover:bg-accent hover:border-primary/50 active:scale-95",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "border-muted"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
          )}
          <span className="text-sm font-medium">
            {isUploading ? t("avatarStep.uploading") : t("avatarStep.upload")}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowAIDialog(true)}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
            "hover:bg-accent hover:border-primary/50 active:scale-95",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "border-muted"
          )}
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-medium">{t("avatarStep.aiMagic")}</span>
        </button>
      </div>

      {/* Default avatars */}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">{t("avatarStep.orPickDefault")}</p>
        <DefaultAvatars selected={selectedDefault} onSelect={handleSelectDefault} />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={handleContinue}
          disabled={isLoading}
          className="w-full"
        >
          {t("avatarStep.continue")}
        </Button>
        <Button
          variant="ghost"
          onClick={onSkip}
          disabled={isLoading}
          className="w-full text-muted-foreground"
        >
          {t("avatarStep.skip")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* AI Avatar Customization Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {tProfile("avatarDialog.title")}
            </DialogTitle>
            <DialogDescription>{tProfile("avatarDialog.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Style Selection */}
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "male", label: tProfile("avatarStyle.male"), desc: tProfile("avatarStyle.maleDesc"), icon: <User className="w-5 h-5" /> },
                  { value: "female", label: tProfile("avatarStyle.female"), desc: tProfile("avatarStyle.femaleDesc"), icon: <UserCircle className="w-5 h-5" /> },
                  { value: "neutral", label: tProfile("avatarStyle.neutral"), desc: tProfile("avatarStyle.neutralDesc"), icon: <Sparkles className="w-5 h-5" /> },
                  { value: "custom", label: tProfile("avatarStyle.custom"), desc: tProfile("avatarStyle.customDesc"), icon: <Sparkles className="w-5 h-5" /> },
                ] as const
              ).map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setSelectedStyle(style.value)}
                  disabled={isGenerating}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all",
                    "hover:bg-accent active:scale-95 disabled:opacity-50",
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
                    {style.icon}
                  </div>
                  <span className="font-medium text-sm">{style.label}</span>
                  <span className="text-xs text-muted-foreground text-center">
                    {style.desc}
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
                  placeholder={tProfile("avatarDialog.customPlaceholder")}
                  context="an AI avatar style description"
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {tProfile("avatarDialog.customHint")}
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
              onClick={() => setShowAIDialog(false)}
              disabled={isGenerating}
            >
              {tProfile("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating || (selectedStyle === "custom" && !customPrompt.trim())}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {generationStages[generationStage]}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {tProfile("avatarDialog.generate")}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
