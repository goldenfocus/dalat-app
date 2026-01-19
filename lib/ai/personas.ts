/**
 * Persona system for AI image generation
 *
 * Allows @mentions in prompts to reference known people using reference images.
 * Example: "Add @riley to the poster" includes Riley's reference photos for the AI.
 */

import { createClient } from "@supabase/supabase-js";
import type { Persona } from "@/lib/types";

// Cache for personas (server-side, revalidates on each request in dev)
let personasCache: Map<string, Persona> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get Supabase client for server-side persona fetching
 */
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Fetch all personas from the database
 */
async function fetchPersonas(): Promise<Map<string, Persona>> {
  const now = Date.now();

  // Return cache if valid
  if (personasCache && now - cacheTimestamp < CACHE_TTL) {
    return personasCache;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("personas")
      .select("*")
      .order("name");

    if (error) {
      console.error("[personas] Failed to fetch:", error);
      return personasCache || new Map();
    }

    // Build handle -> persona map
    const map = new Map<string, Persona>();
    for (const persona of data || []) {
      map.set(persona.handle.toLowerCase(), persona);
    }

    personasCache = map;
    cacheTimestamp = now;

    return map;
  } catch (err) {
    console.error("[personas] Error fetching:", err);
    return personasCache || new Map();
  }
}

/**
 * Extract all @mentions from a prompt and return matching personas
 */
export async function extractPersonaMentions(prompt: string): Promise<{
  personas: Persona[];
  cleanedPrompt: string;
}> {
  const personas = await fetchPersonas();
  const mentionPattern = /@(\w+)/g;
  const foundPersonas: Persona[] = [];
  const seenHandles = new Set<string>();

  // Find all mentioned personas
  let match;
  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();
    const persona = personas.get(handle);

    if (persona && !seenHandles.has(handle)) {
      foundPersonas.push(persona);
      seenHandles.add(handle);
    }
  }

  // Replace @mentions with names in the prompt
  const cleanedPrompt = prompt.replace(mentionPattern, (match, handle) => {
    const persona = personas.get(handle.toLowerCase());
    if (persona) {
      const contextHint = persona.context ? ` (${persona.context})` : "";
      return `${persona.name}${contextHint}`;
    }
    return match;
  });

  return { personas: foundPersonas, cleanedPrompt };
}

/**
 * Check if a prompt contains any persona @mentions
 */
export async function hasPersonaMentions(prompt: string): Promise<boolean> {
  const personas = await fetchPersonas();
  const mentionPattern = /@(\w+)/g;
  let match;

  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();
    if (personas.has(handle)) {
      return true;
    }
  }

  return false;
}

/**
 * Fetch reference images as base64 for inclusion in AI requests
 */
export async function fetchPersonaImages(
  personaList: Persona[]
): Promise<Array<{ persona: Persona; images: Array<{ data: string; mimeType: string }> }>> {
  const results = await Promise.all(
    personaList.map(async (persona) => {
      const images = await Promise.all(
        (persona.reference_images || [])
          .filter((url) => url) // Skip empty URLs
          .map(async (url) => {
            try {
              const response = await fetch(url);
              if (!response.ok) return null;

              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");
              const mimeType = response.headers.get("content-type") || "image/jpeg";

              return { data: base64, mimeType };
            } catch {
              console.warn(`[personas] Failed to fetch reference image: ${url}`);
              return null;
            }
          })
      );

      return {
        persona,
        images: images.filter((img): img is { data: string; mimeType: string } => img !== null),
      };
    })
  );

  return results.filter((r) => r.images.length > 0);
}

/**
 * Get all persona handles for autocomplete/suggestions
 */
export async function getPersonaHandles(): Promise<string[]> {
  const personas = await fetchPersonas();
  return Array.from(personas.keys());
}

/**
 * Clear the personas cache (useful after admin updates)
 */
export function clearPersonasCache(): void {
  personasCache = null;
  cacheTimestamp = 0;
}
