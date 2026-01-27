/**
 * Audio metadata extraction utility
 * Extracts ID3 tags (title, artist, album, duration, album art) from audio files
 * Uses music-metadata package which supports MP3, M4A, FLAC, OGG, etc.
 */

import * as mm from "music-metadata";

export interface AudioMetadata {
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  trackNumber: string | null;
  releaseYear: number | null;
  genre: string | null;
  albumArt: {
    data: Uint8Array;
    format: string;
  } | null;
}

/**
 * Extract metadata from an audio file
 * Works in browser environment by reading File as ArrayBuffer
 */
export async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  try {
    // Read file as ArrayBuffer for music-metadata
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Parse metadata
    const metadata = await mm.parseBuffer(uint8Array, {
      mimeType: file.type,
      size: file.size,
    });

    // Extract common tags
    const { common, format } = metadata;

    // Get duration from format info
    const durationSeconds = format.duration
      ? Math.round(format.duration)
      : null;

    // Get track number (may be "3" or "3/12")
    let trackNumber: string | null = null;
    if (common.track?.no) {
      trackNumber = common.track.of
        ? `${common.track.no}/${common.track.of}`
        : String(common.track.no);
    }

    // Get year from various possible fields
    const releaseYear = common.year || null;

    // Get genre (may be array, take first)
    const genre = common.genre?.[0] || null;

    // Get album art (first picture)
    let albumArt: AudioMetadata["albumArt"] = null;
    if (common.picture && common.picture.length > 0) {
      const pic = common.picture[0];
      albumArt = {
        data: pic.data,
        format: pic.format,
      };
    }

    return {
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      durationSeconds,
      trackNumber,
      releaseYear,
      genre,
      albumArt,
    };
  } catch (error) {
    console.error("Failed to extract audio metadata:", error);
    // Return empty metadata on error - don't block upload
    return {
      title: null,
      artist: null,
      album: null,
      durationSeconds: null,
      trackNumber: null,
      releaseYear: null,
      genre: null,
      albumArt: null,
    };
  }
}

/**
 * Convert album art to a Blob for uploading to storage
 */
export function albumArtToBlob(
  albumArt: AudioMetadata["albumArt"]
): Blob | null {
  if (!albumArt) return null;

  // Map common formats to MIME types
  const mimeTypeMap: Record<string, string> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };

  const mimeType = mimeTypeMap[albumArt.format.toLowerCase()] || "image/jpeg";
  // Create a new Uint8Array to ensure it has a proper ArrayBuffer
  const data = new Uint8Array(albumArt.data);
  return new Blob([data], { type: mimeType });
}

/**
 * Generate a preview URL for album art
 */
export function albumArtToDataUrl(
  albumArt: AudioMetadata["albumArt"]
): string | null {
  if (!albumArt) return null;

  const blob = albumArtToBlob(albumArt);
  if (!blob) return null;

  return URL.createObjectURL(blob);
}

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Check if a file is an audio file that we can extract metadata from
 */
export function isAudioFile(file: File): boolean {
  const audioMimeTypes = [
    "audio/mpeg", // MP3
    "audio/mp4", // M4A, AAC
    "audio/x-m4a", // M4A
    "audio/wav", // WAV
    "audio/ogg", // OGG Vorbis
    "audio/flac", // FLAC
    "audio/aac", // AAC
  ];
  return audioMimeTypes.includes(file.type);
}
