"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ImageIcon, X, Upload, Loader2, Check, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB for hero images
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "site-assets";

interface HomepageConfig {
  id: string;
  hero_image_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

export default function AdminHomepagePage() {
  const [config, setConfig] = useState<HomepageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load current config
  useEffect(() => {
    async function loadConfig() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("homepage_config")
          .select("*")
          .limit(1)
          .single();

        if (error && error.code !== "PGRST116") {
          throw error;
        }

        if (data) {
          setConfig(data);
          setPreviewUrl(data.hero_image_url);
        }
      } catch (err) {
        console.error("Failed to load homepage config:", err);
        setError("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }

    loadConfig();
  }, []);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Only JPG, PNG, and WebP images are allowed";
    }
    if (file.size > MAX_SIZE) {
      return "File must be under 10MB";
    }
    return null;
  };

  const uploadImage = async (file: File) => {
    setError(null);
    setSuccessMessage(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsUploading(true);

    try {
      const supabase = createClient();

      // Generate unique filename
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `hero-${Date.now()}.${ext}`;

      // Delete old image if exists
      if (config?.hero_image_url) {
        const oldPath = config.hero_image_url.split(`/${BUCKET}/`)[1];
        if (oldPath) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }

      // Upload new image
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, file, {
          cacheControl: "31536000", // 1 year cache
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(uploadData.path);

      // Update database
      const { data: updatedConfig, error: updateError } = await supabase
        .from("homepage_config")
        .update({
          hero_image_url: publicUrl,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", config?.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setConfig(updatedConfig);
      setPreviewUrl(publicUrl);
      setSuccessMessage("Hero image updated! Changes will appear on the homepage within 1 minute.");

      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload image. Please try again.");
      setPreviewUrl(config?.hero_image_url || null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!config?.hero_image_url) return;

    setError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      const supabase = createClient();

      // Delete from storage
      const oldPath = config.hero_image_url.split(`/${BUCKET}/`)[1];
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }

      // Update database
      const { data: updatedConfig, error: updateError } = await supabase
        .from("homepage_config")
        .update({
          hero_image_url: null,
          updated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq("id", config.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      setConfig(updatedConfig);
      setPreviewUrl(null);
      setSuccessMessage("Hero image removed. Homepage will show the minimal text hero.");
    } catch (err) {
      console.error("Remove error:", err);
      setError("Failed to remove image");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
    e.target.value = "";
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        uploadImage(file);
      }
    },
    [config]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Home className="h-6 w-6" />
          Homepage Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize the homepage hero section
        </p>
      </div>

      {/* Hero Image Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Hero Image</CardTitle>
          <CardDescription>
            Upload a full-width background image for the homepage hero section.
            The image will be displayed with a gradient overlay for text readability.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Area */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-colors",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              "aspect-[2.5/1]"
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <>
                {/* Image preview with gradient overlay (simulating actual hero) */}
                <img
                  src={previewUrl}
                  alt="Hero preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

                {/* Sample content overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
                  <h2 className="text-xl sm:text-2xl lg:text-4xl font-bold text-white drop-shadow-lg">
                    Find events. Discover venues.
                  </h2>
                  <p className="text-sm sm:text-base text-white/80 drop-shadow mt-1">
                    Your gateway to Da Lat&apos;s vibrant community
                  </p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {["Search", "Map", "Calendar", "Venues"].map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs sm:text-sm font-medium text-white"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Upload overlay on hover */}
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploading ? (
                    <Loader2 className="h-12 w-12 text-white animate-spin" />
                  ) : (
                    <div className="text-center">
                      <Upload className="h-12 w-12 text-white mx-auto" />
                      <p className="text-white mt-2">Click or drag to replace</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 p-8">
                {isUploading ? (
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-center">
                      Click or drag an image here to upload
                    </p>
                    <p className="text-muted-foreground/70 text-sm mt-1">
                      Recommended: 1920x768 or wider (2.5:1 ratio)
                    </p>
                    <p className="text-muted-foreground/70 text-xs mt-1">
                      JPG, PNG, or WebP up to 10MB
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSaving}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {previewUrl ? "Replace Image" : "Upload Image"}
                </>
              )}
            </Button>

            {previewUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemove}
                disabled={isUploading || isSaving}
                className="text-destructive hover:text-destructive"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Remove Image
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Messages */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {successMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {successMessage}
            </p>
          )}

          {/* Info */}
          <div className="text-sm text-muted-foreground space-y-1 pt-4 border-t">
            <p>
              <strong>Current status:</strong>{" "}
              {previewUrl ? "Hero image active" : "Using minimal text hero (no image)"}
            </p>
            {config?.updated_at && (
              <p>
                <strong>Last updated:</strong>{" "}
                {new Date(config.updated_at).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-muted-foreground/70 mt-2">
              Note: Changes may take up to 1 minute to appear on the homepage due to caching.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
