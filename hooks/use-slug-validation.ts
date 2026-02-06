"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { slugify, sanitizeSlug, suggestSlug, finalizeSlug } from "@/lib/utils";

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface UseSlugValidationOptions {
  /** Initial slug value (for editing) */
  initialSlug?: string;
  /** Whether slug editing is allowed */
  editable: boolean;
  /** Whether we're in editing mode (vs creating) */
  isEditing: boolean;
}

interface UseSlugValidationReturn {
  slug: string;
  setSlug: (slug: string) => void;
  slugStatus: SlugStatus;
  slugTouched: boolean;
  /** Handle slug input change (sanitizes input) */
  handleSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Handle slug input blur (finalizes slug) */
  handleSlugBlur: () => void;
  /** Update slug based on title (for auto-suggestion) */
  updateSlugFromTitle: (title: string) => void;
  /** Get final slug for submission */
  getFinalSlug: (title: string) => string;
}

/**
 * Hook to manage slug validation state and logic.
 * Handles availability checking, sanitization, and auto-suggestion.
 */
export function useSlugValidation({
  initialSlug = "",
  editable,
  isEditing,
}: UseSlugValidationOptions): UseSlugValidationReturn {
  const [slug, setSlugRaw] = useState(initialSlug);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugTouched, setSlugTouched] = useState(false);

  // Check slug availability with debounce
  useEffect(() => {
    if (!slug || !slugTouched) {
      setSlugStatus("idle");
      return;
    }

    // Basic validation
    if (slug.length < 1 || !/^[a-z0-9_-]+$/.test(slug)) {
      setSlugStatus("invalid");
      return;
    }

    // Skip check if slug hasn't changed from original
    if (isEditing && slug === initialSlug) {
      setSlugStatus("available");
      return;
    }

    setSlugStatus("checking");

    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (data) {
        setSlugStatus("taken");
      } else {
        setSlugStatus("available");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [slug, slugTouched, isEditing, initialSlug]);

  const setSlug = useCallback((newSlug: string) => {
    setSlugRaw(newSlug);
  }, []);

  const handleSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeSlug(e.target.value);
    setSlugRaw(sanitized);
    setSlugTouched(true);
  }, []);

  const handleSlugBlur = useCallback(() => {
    setSlugRaw(finalizeSlug(slug));
  }, [slug]);

  const updateSlugFromTitle = useCallback((title: string) => {
    if (!isEditing && !slugTouched && editable) {
      const suggested = suggestSlug(title);
      setSlugRaw(suggested);
    }
  }, [isEditing, slugTouched, editable]);

  const getFinalSlug = useCallback((title: string): string => {
    const cleanSlug = finalizeSlug(slug);
    if (editable && cleanSlug && slugStatus === "available") {
      return cleanSlug;
    }
    // Generate a random slug as fallback
    const base = slugify(title).slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 6);
    return `${base}-${suffix}`;
  }, [slug, slugStatus, editable]);

  return {
    slug,
    setSlug,
    slugStatus,
    slugTouched,
    handleSlugChange,
    handleSlugBlur,
    updateSlugFromTitle,
    getFinalSlug,
  };
}
