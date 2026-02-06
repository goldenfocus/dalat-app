"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseImageUploadOptions {
  initialImageUrl?: string | null;
  initialImageFit?: "cover" | "contain";
  initialFocalPoint?: string | null;
}

interface UseImageUploadReturn {
  imageUrl: string | null;
  setImageUrl: (url: string | null) => void;
  pendingFile: File | null;
  imageFit: "cover" | "contain";
  setImageFit: (fit: "cover" | "contain") => void;
  focalPoint: string | null;
  setFocalPoint: (point: string | null) => void;
  /** Handle image change from FlyerBuilder */
  handleImageChange: (url: string | null, file?: File) => void;
  /** Upload pending image to storage and return public URL */
  uploadImage: (eventId: string) => Promise<string | null>;
}

/**
 * Hook to manage image upload state and logic.
 * Handles file selection, base64 data URLs, and Supabase storage uploads.
 */
export function useImageUpload({
  initialImageUrl = null,
  initialImageFit = "cover",
  initialFocalPoint = null,
}: UseImageUploadOptions = {}): UseImageUploadReturn {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [imageFit, setImageFit] = useState<"cover" | "contain">(initialImageFit);
  const [focalPoint, setFocalPoint] = useState<string | null>(initialFocalPoint);

  const handleImageChange = useCallback((url: string | null, file?: File) => {
    setImageUrl(url);
    setPendingFile(file ?? null);
  }, []);

  const uploadImage = useCallback(async (eventId: string): Promise<string | null> => {
    const supabase = createClient();

    // If we have a pending file, upload it
    if (pendingFile) {
      const ext = pendingFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(fileName, pendingFile, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error("Failed to upload image");

      const { data: { publicUrl } } = supabase.storage
        .from("event-media")
        .getPublicUrl(fileName);

      return publicUrl;
    }

    // If imageUrl is a base64/data URL (from AI generation), upload it
    if (imageUrl?.startsWith("data:")) {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const ext = blob.type.split("/")[1] || "png";
      const fileName = `${eventId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-media")
        .upload(fileName, blob, { cacheControl: "3600", upsert: true });

      if (uploadError) throw new Error("Failed to upload generated image");

      const { data: { publicUrl } } = supabase.storage
        .from("event-media")
        .getPublicUrl(fileName);

      return publicUrl;
    }

    // Otherwise return the URL as-is (external URL or null)
    return imageUrl;
  }, [pendingFile, imageUrl]);

  return {
    imageUrl,
    setImageUrl,
    pendingFile,
    imageFit,
    setImageFit,
    focalPoint,
    setFocalPoint,
    handleImageChange,
    uploadImage,
  };
}
