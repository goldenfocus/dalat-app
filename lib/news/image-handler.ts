/**
 * Image handling for news articles
 * Downloads source images to R2 storage, or generates with AI if none available
 */

import { getStorageProvider } from '@/lib/storage';
import { generateCoverImage } from '@/lib/blog/cover-generator';

const USER_AGENT = 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)';

/** Timeout for image downloads (10 seconds) */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

interface NewsImage {
  original_url: string;
  stored_url: string;
  attribution: string;
  alt: string;
}

/**
 * Download an image from a URL and upload to R2 storage
 */
async function downloadAndStoreImage(
  imageUrl: string,
  slug: string,
  attribution: string
): Promise<NewsImage | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Skip non-image content types
    if (!contentType.startsWith('image/')) return null;

    const arrayBuffer = await response.arrayBuffer();

    // Validate: skip tiny images (likely tracking pixels)
    if (arrayBuffer.byteLength < 5000) return null;
    // Skip huge images
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) return null;

    const buffer = Buffer.from(arrayBuffer);

    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';

    const filename = `news/${slug}/${Date.now()}.${ext}`;

    const storage = await getStorageProvider('event-media');

    const publicUrl = await storage.upload('event-media', filename, buffer, {
      contentType,
      cacheControl: '86400',
    });

    return {
      original_url: imageUrl,
      stored_url: publicUrl,
      attribution,
      alt: `News image from ${attribution}`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[image-handler] Timeout downloading ${imageUrl}`);
    } else {
      console.error(`[image-handler] Failed to download ${imageUrl}:`, error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Handle images for a news article:
 * 1. Try to download the best source images
 * 2. Fall back to AI-generated cover image if no source images available
 */
export async function handleNewsImages(
  sourceImages: string[],
  sourceName: string,
  slug: string,
  imageDescriptions: string[] = []
): Promise<{
  coverImageUrl: string | null;
  sourceImages: NewsImage[];
}> {
  const storedImages: NewsImage[] = [];

  // Filter out obviously invalid URLs before attempting downloads
  const validUrls = sourceImages.filter(url =>
    url.startsWith('http://') || url.startsWith('https://')
  );

  // Try downloading source images (limit to first 3)
  for (const url of validUrls.slice(0, 3)) {
    const stored = await downloadAndStoreImage(url, slug, sourceName);
    if (stored) {
      storedImages.push(stored);
    }
  }

  // Use first stored image as cover, or generate one
  let coverImageUrl: string | null = storedImages[0]?.stored_url || null;

  if (!coverImageUrl && imageDescriptions.length > 0) {
    try {
      const prompt = `${imageDescriptions[0]}

Style requirements:
- NO text, NO lettering, NO words in the image
- Landscape orientation (16:9)
- High quality, journalistic/editorial style
- Captures the mood of \u0110\u00e0 L\u1ea1t, Vietnam`;

      coverImageUrl = await generateCoverImage(slug, prompt);
    } catch (error) {
      console.error(`[image-handler] Cover generation failed:`, error);
    }
  }

  return { coverImageUrl, sourceImages: storedImages };
}
