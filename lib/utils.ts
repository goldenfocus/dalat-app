import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Decodes unicode escape sequences in a string (e.g., \u0026 -> &)
 * This is useful for text imported from external sources that may contain
 * literal unicode escapes instead of the actual characters.
 */
export function decodeUnicodeEscapes(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

/**
 * Convert text to a URL-friendly slug with proper romanization.
 * Handles Vietnamese diacritics (phố → pho) and other Latin-based languages.
 *
 * @example
 * slugify("Phố Bên Đồi") // => "pho-ben-doi"
 * slugify("Café Münich") // => "cafe-munich"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD") // Decompose: ở → o + combining marks
    .replace(/[\u0300-\u036f]/g, "") // Remove combining diacritical marks
    .replace(/đ/g, "d") // Vietnamese đ isn't decomposed by NFD
    .replace(/[^a-z0-9\s-]/g, "") // Keep only alphanumeric, spaces, hyphens
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens
}

/**
 * Sanitize a slug while typing (allows trailing hyphens during input)
 */
export function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-_]/g, "") // Keep alphanumeric, spaces, hyphens, underscores
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/g, ""); // Only trim leading hyphen, allow trailing while typing
}

/**
 * Final cleanup of slug - same as slugify but explicit about intent
 */
export function finalizeSlug(input: string): string {
  return slugify(input);
}

/**
 * Suggest a slug from a title (truncated to max length)
 */
export function suggestSlug(title: string, maxLength = 50): string {
  return slugify(title).slice(0, maxLength);
}
