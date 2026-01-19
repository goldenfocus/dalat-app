/**
 * Persona system for AI image generation
 *
 * Allows @mentions in prompts to reference known people using reference images.
 * Example: "Add @riley to the poster" includes Riley's reference photos for the AI.
 */

export interface Persona {
  /** Display name */
  name: string;
  /** Handle for @mentions (lowercase) */
  handle: string;
  /** URLs to reference images (1-3 photos work best) */
  referenceImages: string[];
  /** Brief context for the AI about this person */
  context?: string;
  /** Preferred rendering style */
  style?: string;
}

/**
 * Known personas for the dalat.app community
 *
 * Add reference images to Supabase storage under 'personas/' bucket,
 * then add the URLs here. 1-3 clear photos per person works best.
 */
export const PERSONAS: Record<string, Persona> = {
  riley: {
    name: "Riley",
    handle: "riley",
    referenceImages: [
      // TODO: Add Riley's reference image URLs
      // e.g., "https://your-supabase.supabase.co/storage/v1/object/public/personas/riley-1.jpg"
    ],
    context: "founder of the hackathon",
    style: "friendly illustrated style",
  },
  yan: {
    name: "Yan",
    handle: "yan",
    referenceImages: [
      // TODO: Add Yan's reference image URLs
    ],
    context: "developer and community member",
  },
};

/**
 * Extract all @mentions from a prompt and return matching personas
 */
export function extractPersonaMentions(prompt: string): {
  personas: Persona[];
  cleanedPrompt: string;
} {
  const mentionPattern = /@(\w+)/g;
  const foundPersonas: Persona[] = [];
  const seenHandles = new Set<string>();

  // Find all mentioned personas
  let match;
  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();
    const persona = PERSONAS[handle];

    if (persona && !seenHandles.has(handle)) {
      foundPersonas.push(persona);
      seenHandles.add(handle);
    }
  }

  // Replace @mentions with names in the prompt
  const cleanedPrompt = prompt.replace(mentionPattern, (match, handle) => {
    const persona = PERSONAS[handle.toLowerCase()];
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
export function hasPersonaMentions(prompt: string): boolean {
  const mentionPattern = /@(\w+)/g;
  let match;

  while ((match = mentionPattern.exec(prompt)) !== null) {
    const handle = match[1].toLowerCase();
    if (PERSONAS[handle]) {
      return true;
    }
  }

  return false;
}

/**
 * Fetch reference images as base64 for inclusion in AI requests
 */
export async function fetchPersonaImages(
  personas: Persona[]
): Promise<Array<{ persona: Persona; images: Array<{ data: string; mimeType: string }> }>> {
  const results = await Promise.all(
    personas.map(async (persona) => {
      const images = await Promise.all(
        persona.referenceImages
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
export function getPersonaHandles(): string[] {
  return Object.keys(PERSONAS);
}
