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
