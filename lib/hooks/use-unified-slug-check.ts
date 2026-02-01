"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type SlugStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "reserved"
  | "invalid"
  | "too_short";

export type EntityType = "venue" | "organizer" | "profile";

interface UseUnifiedSlugCheckOptions {
  /** The slug to check */
  slug: string;
  /** Type of entity claiming this slug */
  entityType: EntityType;
  /** ID of the entity if editing (to allow keeping current slug) */
  entityId?: string;
  /** Current slug if editing (skip check if unchanged) */
  originalSlug?: string;
  /** Minimum slug length (default: 2) */
  minLength?: number;
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number;
  /** Whether the slug field has been touched */
  touched?: boolean;
}

interface SlugCheckResult {
  status: SlugStatus;
  isChecking: boolean;
  isAvailable: boolean;
  message: string;
  /** Force a recheck */
  recheck: () => void;
}

/**
 * Hook for checking slug availability in the unified namespace.
 *
 * Uses the `check_unified_slug_available` RPC function to verify the slug
 * is not taken by any venue, organizer, or profile, and is not reserved.
 *
 * @example
 * ```tsx
 * const { status, message, isAvailable } = useUnifiedSlugCheck({
 *   slug: venueSlug,
 *   entityType: "venue",
 *   entityId: venue?.id,
 *   originalSlug: venue?.slug,
 *   touched: slugFieldTouched,
 * });
 *
 * // Show status indicator
 * {status === "checking" && <Spinner />}
 * {status === "available" && <CheckIcon />}
 * {status === "taken" && <XIcon />}
 * ```
 */
export function useUnifiedSlugCheck({
  slug,
  entityType,
  entityId,
  originalSlug,
  minLength = 2,
  debounceMs = 300,
  touched = true,
}: UseUnifiedSlugCheckOptions): SlugCheckResult {
  const [status, setStatus] = useState<SlugStatus>("idle");
  const [checkId, setCheckId] = useState(0);

  const recheck = useCallback(() => {
    setCheckId((id) => id + 1);
  }, []);

  useEffect(() => {
    // Don't check if field hasn't been touched
    if (!touched) {
      setStatus("idle");
      return;
    }

    // Don't check empty slugs
    if (!slug || slug.trim() === "") {
      setStatus("idle");
      return;
    }

    const normalizedSlug = slug.toLowerCase().trim();

    // Check minimum length
    if (normalizedSlug.length < minLength) {
      setStatus("too_short");
      return;
    }

    // Validate format: lowercase alphanumeric, dots, underscores, hyphens
    // Must start and end with alphanumeric
    const validPattern = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;
    if (!validPattern.test(normalizedSlug)) {
      setStatus("invalid");
      return;
    }

    // If unchanged from original, it's available
    if (originalSlug && normalizedSlug === originalSlug.toLowerCase()) {
      setStatus("available");
      return;
    }

    // Start checking
    setStatus("checking");

    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc(
          "check_unified_slug_available",
          {
            p_slug: normalizedSlug,
            p_entity_type: entityId ? entityType : null,
            p_entity_id: entityId || null,
          }
        );

        if (error) {
          console.error("Slug check error:", error);
          setStatus("idle");
          return;
        }

        if (data?.available) {
          setStatus("available");
        } else {
          // Map reason to status
          switch (data?.reason) {
            case "reserved":
              setStatus("reserved");
              break;
            case "taken":
              setStatus("taken");
              break;
            case "too_short":
              setStatus("too_short");
              break;
            case "invalid_format":
              setStatus("invalid");
              break;
            default:
              setStatus("taken");
          }
        }
      } catch (err) {
        console.error("Slug check error:", err);
        setStatus("idle");
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [
    slug,
    entityType,
    entityId,
    originalSlug,
    minLength,
    debounceMs,
    touched,
    checkId,
  ]);

  // Derive convenience values
  const isChecking = status === "checking";
  const isAvailable = status === "available";

  // Generate user-friendly message
  const message = getStatusMessage(status, slug);

  return {
    status,
    isChecking,
    isAvailable,
    message,
    recheck,
  };
}

function getStatusMessage(status: SlugStatus, slug: string): string {
  switch (status) {
    case "idle":
      return "";
    case "checking":
      return "Checking availability...";
    case "available":
      return `dalat.app/${slug.toLowerCase()} is available`;
    case "taken":
      return "This URL is already taken";
    case "reserved":
      return "This URL is reserved";
    case "invalid":
      return "Only lowercase letters, numbers, dots, underscores, and hyphens allowed";
    case "too_short":
      return "URL must be at least 2 characters";
    default:
      return "";
  }
}

/**
 * Status indicator component styling helper.
 * Returns tailwind classes for the status indicator.
 */
export function getSlugStatusStyles(status: SlugStatus): {
  textColor: string;
  bgColor: string;
  icon: "check" | "x" | "loader" | "alert" | null;
} {
  switch (status) {
    case "available":
      return {
        textColor: "text-green-600",
        bgColor: "bg-green-50",
        icon: "check",
      };
    case "taken":
    case "reserved":
      return { textColor: "text-red-600", bgColor: "bg-red-50", icon: "x" };
    case "invalid":
    case "too_short":
      return {
        textColor: "text-amber-600",
        bgColor: "bg-amber-50",
        icon: "alert",
      };
    case "checking":
      return {
        textColor: "text-muted-foreground",
        bgColor: "bg-muted",
        icon: "loader",
      };
    default:
      return {
        textColor: "text-muted-foreground",
        bgColor: "bg-transparent",
        icon: null,
      };
  }
}
