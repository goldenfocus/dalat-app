import { createClient } from "@supabase/supabase-js";
import type {
  ImageVersion,
  ImageVersionContentType,
  ImageVersionFieldName,
} from "./types";

/**
 * Get Supabase client with service role for server-side operations
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase service credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface ImageMetadata {
  alt?: string | null;
  description?: string | null;
  keywords?: string[] | null;
  colors?: string[] | null;
}

/**
 * Save a new image version to the history.
 * The cleanup trigger will automatically keep only the last 5 versions.
 */
export async function saveImageVersion(params: {
  contentType: ImageVersionContentType;
  contentId: string;
  fieldName: ImageVersionFieldName;
  imageUrl: string;
  metadata?: ImageMetadata;
  generationPrompt?: string;
  createdBy?: string;
}): Promise<ImageVersion | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("image_versions")
    .insert({
      content_type: params.contentType,
      content_id: params.contentId,
      field_name: params.fieldName,
      image_url: params.imageUrl,
      alt: params.metadata?.alt ?? null,
      description: params.metadata?.description ?? null,
      keywords: params.metadata?.keywords ?? null,
      colors: params.metadata?.colors ?? null,
      generation_prompt: params.generationPrompt ?? null,
      created_by: params.createdBy ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[image-versions] Failed to save version:", error);
    return null;
  }

  return data as ImageVersion;
}

/**
 * Get all image versions for a content item, newest first.
 * Limited to 5 by the cleanup trigger.
 */
export async function getImageVersions(params: {
  contentType: ImageVersionContentType;
  contentId: string;
  fieldName: ImageVersionFieldName;
}): Promise<ImageVersion[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("image_versions")
    .select("*")
    .eq("content_type", params.contentType)
    .eq("content_id", params.contentId)
    .eq("field_name", params.fieldName)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[image-versions] Failed to get versions:", error);
    return [];
  }

  return (data ?? []) as ImageVersion[];
}

/**
 * Get a single image version by ID.
 */
export async function getImageVersion(
  versionId: string
): Promise<ImageVersion | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("image_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (error) {
    console.error("[image-versions] Failed to get version:", error);
    return null;
  }

  return data as ImageVersion;
}

/**
 * Restore an image version by copying its URL to the parent record.
 * Returns the restored image URL and metadata.
 */
export async function restoreImageVersion(
  versionId: string
): Promise<{ imageUrl: string; metadata: ImageMetadata } | null> {
  const supabase = getSupabaseAdmin();

  // Get the version to restore
  const { data: version, error: versionError } = await supabase
    .from("image_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (versionError || !version) {
    console.error("[image-versions] Failed to get version for restore:", versionError);
    return null;
  }

  const { content_type, content_id, image_url, alt, description, keywords, colors } =
    version as ImageVersion;

  // Update the parent record based on content type
  let updateError: Error | null = null;

  switch (content_type) {
    case "event": {
      const { error } = await supabase
        .from("events")
        .update({
          image_url,
          image_alt: alt,
          image_description: description,
          image_keywords: keywords,
          image_colors: colors,
        })
        .eq("id", content_id);
      updateError = error;
      break;
    }
    case "blog": {
      const { error } = await supabase
        .from("blog_posts")
        .update({
          cover_image_url: image_url,
          cover_image_alt: alt,
          cover_image_description: description,
          cover_image_keywords: keywords,
          cover_image_colors: colors,
        })
        .eq("id", content_id);
      updateError = error;
      break;
    }
    case "profile": {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: image_url })
        .eq("id", content_id);
      updateError = error;
      break;
    }
    case "venue": {
      // Venue could be logo or cover photo
      const { error } = await supabase
        .from("venues")
        .update({ cover_photo_url: image_url })
        .eq("id", content_id);
      updateError = error;
      break;
    }
    case "organizer": {
      const { error } = await supabase
        .from("organizers")
        .update({ logo_url: image_url })
        .eq("id", content_id);
      updateError = error;
      break;
    }
  }

  if (updateError) {
    console.error("[image-versions] Failed to restore version:", updateError);
    return null;
  }

  return {
    imageUrl: image_url,
    metadata: { alt, description, keywords, colors },
  };
}

/**
 * Delete a specific image version.
 * Note: This doesn't delete the actual file from storage.
 */
export async function deleteImageVersion(versionId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("image_versions")
    .delete()
    .eq("id", versionId);

  if (error) {
    console.error("[image-versions] Failed to delete version:", error);
    return false;
  }

  return true;
}
