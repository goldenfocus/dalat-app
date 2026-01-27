/**
 * Structured data (JSON-LD) for event materials
 * Adds schema.org markup for SEO - AudioObject, VideoObject, etc.
 * This helps search engines understand and index media content.
 *
 * Note: Uses dangerouslySetInnerHTML with JSON.stringify which is safe
 * because we're serializing our own data structures, not user HTML.
 */

import type { EventMaterial } from "@/lib/types";

interface EventMaterialsStructuredDataProps {
  materials: EventMaterial[];
  eventName: string;
  eventUrl: string;
}

/**
 * Convert duration in seconds to ISO 8601 format (PT#H#M#S)
 * e.g., 150 seconds -> "PT2M30S"
 */
function durationToISO8601(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  let result = "PT";
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (secs > 0 || result === "PT") result += `${secs}S`;

  return result;
}

/**
 * Generate AudioObject schema for an audio material
 */
function generateAudioObjectSchema(
  material: EventMaterial,
  eventName: string,
  eventUrl: string
) {
  const schema: Record<string, unknown> = {
    "@type": "AudioObject",
    "@id": `${eventUrl}#audio-${material.id}`,
    contentUrl: material.file_url,
    encodingFormat: material.mime_type || "audio/mpeg",
  };

  // Name: prefer title from ID3 tags, fall back to filename
  if (material.title) {
    schema.name = material.title;
  } else if (material.original_filename) {
    schema.name = material.original_filename;
  }

  // Description if available
  if (material.description) {
    schema.description = material.description;
  }

  // Artist/creator
  if (material.artist) {
    schema.byArtist = {
      "@type": "MusicGroup",
      name: material.artist,
    };
  }

  // Album
  if (material.album) {
    schema.inAlbum = {
      "@type": "MusicAlbum",
      name: material.album,
    };
  }

  // Duration in ISO 8601 format
  if (material.duration_seconds) {
    schema.duration = durationToISO8601(material.duration_seconds);
  }

  // Thumbnail (album art)
  if (material.thumbnail_url) {
    schema.thumbnailUrl = material.thumbnail_url;
  }

  // Genre
  if (material.genre) {
    schema.genre = material.genre;
  }

  // File size
  if (material.file_size) {
    schema.contentSize = `${material.file_size} bytes`;
  }

  // Part of event
  schema.isPartOf = {
    "@type": "Event",
    name: eventName,
    url: eventUrl,
  };

  return schema;
}

/**
 * Generate VideoObject schema for a video material
 */
function generateVideoObjectSchema(
  material: EventMaterial,
  eventName: string,
  eventUrl: string
) {
  const schema: Record<string, unknown> = {
    "@type": "VideoObject",
    "@id": `${eventUrl}#video-${material.id}`,
    contentUrl: material.file_url,
  };

  if (material.title || material.original_filename) {
    schema.name = material.title || material.original_filename;
  }

  if (material.description) {
    schema.description = material.description;
  }

  if (material.thumbnail_url) {
    schema.thumbnailUrl = material.thumbnail_url;
  }

  if (material.duration_seconds) {
    schema.duration = durationToISO8601(material.duration_seconds);
  }

  schema.isPartOf = {
    "@type": "Event",
    name: eventName,
    url: eventUrl,
  };

  return schema;
}

/**
 * Generate VideoObject schema for a YouTube video
 */
function generateYouTubeSchema(
  material: EventMaterial,
  eventName: string,
  eventUrl: string
) {
  if (!material.youtube_video_id) return null;

  const schema: Record<string, unknown> = {
    "@type": "VideoObject",
    "@id": `${eventUrl}#youtube-${material.id}`,
    embedUrl: `https://www.youtube.com/embed/${material.youtube_video_id}`,
    url: material.youtube_url,
    thumbnailUrl: `https://img.youtube.com/vi/${material.youtube_video_id}/maxresdefault.jpg`,
  };

  if (material.title) {
    schema.name = material.title;
  }

  if (material.description) {
    schema.description = material.description;
  }

  schema.isPartOf = {
    "@type": "Event",
    name: eventName,
    url: eventUrl,
  };

  return schema;
}

/**
 * Generate ImageObject schema for an image material
 */
function generateImageObjectSchema(
  material: EventMaterial,
  eventName: string,
  eventUrl: string
) {
  const schema: Record<string, unknown> = {
    "@type": "ImageObject",
    "@id": `${eventUrl}#image-${material.id}`,
    contentUrl: material.file_url,
    url: material.file_url,
  };

  if (material.title || material.original_filename) {
    schema.name = material.title || material.original_filename;
  }

  if (material.description) {
    schema.description = material.description;
  }

  schema.isPartOf = {
    "@type": "Event",
    name: eventName,
    url: eventUrl,
  };

  return schema;
}

/**
 * Generate DigitalDocument schema for document materials (PDF, etc.)
 */
function generateDocumentSchema(
  material: EventMaterial,
  eventName: string,
  eventUrl: string
) {
  const schema: Record<string, unknown> = {
    "@type": "DigitalDocument",
    "@id": `${eventUrl}#document-${material.id}`,
    url: material.file_url,
    encodingFormat: material.mime_type,
  };

  if (material.title || material.original_filename) {
    schema.name = material.title || material.original_filename;
  }

  if (material.description) {
    schema.description = material.description;
  }

  if (material.file_size) {
    schema.size = `${material.file_size} bytes`;
  }

  schema.isPartOf = {
    "@type": "Event",
    name: eventName,
    url: eventUrl,
  };

  return schema;
}

/**
 * Component that renders JSON-LD structured data for event materials
 * Add this to the event page to improve SEO for materials
 */
export function EventMaterialsStructuredData({
  materials,
  eventName,
  eventUrl,
}: EventMaterialsStructuredDataProps) {
  if (!materials || materials.length === 0) return null;

  const schemas: Record<string, unknown>[] = [];

  for (const material of materials) {
    let schema: Record<string, unknown> | null = null;

    switch (material.material_type) {
      case "audio":
        if (material.file_url) {
          schema = generateAudioObjectSchema(material, eventName, eventUrl);
        }
        break;

      case "video":
        if (material.file_url) {
          schema = generateVideoObjectSchema(material, eventName, eventUrl);
        }
        break;

      case "youtube":
        schema = generateYouTubeSchema(material, eventName, eventUrl);
        break;

      case "image":
        if (material.file_url) {
          schema = generateImageObjectSchema(material, eventName, eventUrl);
        }
        break;

      case "pdf":
      case "document":
        if (material.file_url) {
          schema = generateDocumentSchema(material, eventName, eventUrl);
        }
        break;
    }

    if (schema) {
      schemas.push(schema);
    }
  }

  if (schemas.length === 0) return null;

  // Wrap in ItemList for multiple items, or return single item
  const jsonLd =
    schemas.length === 1
      ? {
          "@context": "https://schema.org",
          ...schemas[0],
        }
      : {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Materials for ${eventName}`,
          itemListElement: schemas.map((schema, index) => ({
            "@type": "ListItem",
            position: index + 1,
            item: schema,
          })),
        };

  // JSON.stringify is safe here - we're serializing our own data structures
  // not user-provided HTML content
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
