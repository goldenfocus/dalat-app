/**
 * Persona system for AI image generation
 *
 * Allows @mentions in prompts to reference known people using reference images.
 * Example: "Add @riley to the poster" includes Riley's reference photos for the AI.
 *
 * Fallback: If no persona exists, checks if a user profile with that username
 * has an avatar_url to use as a single reference image.
 */

import { createClient } from "@supabase/supabase-js";
import type { Persona, Profile } from "@/lib/types";

/**
 * Represents a matched person - either a full Persona or a Profile with avatar
 */
export type PersonaMatch = {
  type: "persona" | "profile";
  handle: string;
  name: string;
  context: string | null;
  style: string | null;
  reference_images: string[];
};

// Cache for personas (server-side, revalidates on each request in dev)
let personasCache: Map<string, Persona> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

// Cache for profile lookups (separate cache for usernames)
let profilesCache: Map<string, Profile | null> | null = null;
let profilesCacheTimestamp = 0;

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
 * Look up a profile by username (case-insensitive)
 * Returns the profile if it exists and has an avatar_url
 */
async function fetchProfileByUsername(username: string): Promise<Profile | null> {
  const now = Date.now();

  // Check cache first
  if (profilesCache && now - profilesCacheTimestamp < CACHE_TTL) {
    const cached = profilesCache.get(username.toLowerCase());
    if (cached !== undefined) {
      return cached;
    }
  } else {
    // Reset cache if expired
    profilesCache = new Map();
    profilesCacheTimestamp = now;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", username)
      .single();

    if (error || !data) {
      profilesCache?.set(username.toLowerCase(), null);
      return null;
    }

    profilesCache?.set(username.toLowerCase(), data);
    return data;
  } catch (err) {
    console.error("[personas] Error fetching profile:", err);
    return null;
  }
}

/**
 * Convert a profile with avatar to a PersonaMatch
 */
function profileToPersonaMatch(profile: Profile, handle: string): PersonaMatch | null {
  if (!profile.avatar_url) {
    return null;
  }

  return {
    type: "profile",
    handle,
    name: profile.display_name || profile.username || handle,
    context: null,
    style: null,
    reference_images: [profile.avatar_url],
  };
}

/**
 * Convert a Persona to a PersonaMatch
 */
function personaToMatch(persona: Persona): PersonaMatch {
  return {
    type: "persona",
    handle: persona.handle,
    name: persona.name,
    context: persona.context,
    style: persona.style,
    reference_images: persona.reference_images || [],
  };
}

/**
 * Extract all @mentions from a prompt and return matching personas/profiles
 *
 * Priority: 1) Persona by handle, 2) Profile by username with avatar
 */
export async function extractPersonaMentions(prompt: string): Promise<{
  personas: Persona[]; // Deprecated: use matches instead
  matches: PersonaMatch[];
  cleanedPrompt: string;
}> {
  const personas = await fetchPersonas();
  const mentionPattern = /@(\w+)/g;
  const foundPersonas: Persona[] = [];
  const foundMatches: PersonaMatch[] = [];
  const seenHandles = new Set<string>();

  // Collect all unique @handles first
  const handles: string[] = [];
  let match;
  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();
    if (!seenHandles.has(handle)) {
      handles.push(handle);
      seenHandles.add(handle);
    }
  }

  // Look up each handle - persona first, then profile fallback
  for (const handle of handles) {
    const persona = personas.get(handle);

    if (persona) {
      // Found a persona - use it
      foundPersonas.push(persona);
      foundMatches.push(personaToMatch(persona));
    } else {
      // No persona - try profile lookup
      const profile = await fetchProfileByUsername(handle);
      if (profile?.avatar_url) {
        const profileMatch = profileToPersonaMatch(profile, handle);
        if (profileMatch) {
          foundMatches.push(profileMatch);
        }
      }
    }
  }

  // Build a lookup map for cleaning the prompt
  const matchMap = new Map<string, PersonaMatch>();
  for (const m of foundMatches) {
    matchMap.set(m.handle.toLowerCase(), m);
  }

  // Replace @mentions with names in the prompt
  const cleanedPrompt = prompt.replace(/@(\w+)/g, (original, handle) => {
    const m = matchMap.get(handle.toLowerCase());
    if (m) {
      const contextHint = m.context ? ` (${m.context})` : "";
      return `${m.name}${contextHint}`;
    }
    return original;
  });

  return { personas: foundPersonas, matches: foundMatches, cleanedPrompt };
}

/**
 * Check if a prompt contains any resolvable @mentions (persona or profile with avatar)
 */
export async function hasPersonaMentions(prompt: string): Promise<boolean> {
  const personas = await fetchPersonas();
  const mentionPattern = /@(\w+)/g;
  let match;

  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();

    // Check persona first
    if (personas.has(handle)) {
      return true;
    }

    // Fallback: check profile
    const profile = await fetchProfileByUsername(handle);
    if (profile?.avatar_url) {
      return true;
    }
  }

  return false;
}

/**
 * Fetch reference images as base64 for inclusion in AI requests
 * Accepts PersonaMatch[] (which includes both personas and profile-based matches)
 */
export async function fetchPersonaImages(
  matchList: PersonaMatch[]
): Promise<Array<{ persona: PersonaMatch; images: Array<{ data: string; mimeType: string }> }>> {
  const results = await Promise.all(
    matchList.map(async (match) => {
      const images = await Promise.all(
        (match.reference_images || [])
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
        persona: match,
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
 * Clear the personas and profiles cache (useful after admin updates)
 */
export function clearPersonasCache(): void {
  personasCache = null;
  cacheTimestamp = 0;
  profilesCache = null;
  profilesCacheTimestamp = 0;
}
