/**
 * Image handling for news articles
 * Downloads source images to R2 storage, or generates with AI if none available
 */

import { getStorageProvider } from '@/lib/storage';
import { generateCoverViaChain } from '@/lib/ai/cover-chain';
import { logPipelineEvent, getPipelineLogClient } from '@/lib/news/pipeline-log';

const USER_AGENT = 'Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)';

/** Timeout for image downloads (10 seconds) */
const IMAGE_FETCH_TIMEOUT_MS = 10_000;

interface NewsImage {
  original_url: string;
  stored_url: string;
  attribution: string;
  alt: string;
}

/** Record a rejected source image so silent drops show up in the pipeline log */
async function logRejectedImage(imageUrl: string, slug: string, reason: string): Promise<void> {
  const client = getPipelineLogClient();
  if (!client) return;
  await logPipelineEvent(client, {
    stage: 'news-images',
    level: 'warn',
    message: 'Source image rejected',
    meta: { imageUrl, slug, reason },
  });
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

    if (!response.ok) {
      await logRejectedImage(imageUrl, slug, `http-${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Skip non-image content types
    if (!contentType.startsWith('image/')) {
      await logRejectedImage(imageUrl, slug, 'not-image');
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Validate: skip tiny images (likely tracking pixels)
    if (arrayBuffer.byteLength < 5000) {
      await logRejectedImage(imageUrl, slug, 'too-small');
      return null;
    }
    // Skip huge images
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      await logRejectedImage(imageUrl, slug, 'too-large');
      return null;
    }

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
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      console.error(`[image-handler] Timeout downloading ${imageUrl}`);
    } else {
      console.error(`[image-handler] Failed to download ${imageUrl}:`, error);
    }
    const client = getPipelineLogClient();
    if (client) {
      await logPipelineEvent(client, {
        stage: 'image-download',
        level: 'error',
        message: isTimeout
          ? `Timeout downloading source image`
          : `Failed to download source image: ${error instanceof Error ? error.message : String(error)}`,
        meta: { imageUrl, slug },
      });
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
  title: string,
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

  // Use first stored image as cover, or generate one via the tiered chain
  let coverImageUrl: string | null = storedImages[0]?.stored_url || null;

  if (!coverImageUrl) {
    const generated = await generateCoverViaChain({
      slug,
      title,
      description: imageDescriptions[0],
    });
    coverImageUrl = generated?.url ?? null;
  }

  return { coverImageUrl, sourceImages: storedImages };
}
