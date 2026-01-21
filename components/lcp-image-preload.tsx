/**
 * LCP Image Preload Component
 *
 * Preloads the hero image with aggressive optimization for slow networks.
 * Uses smaller width (384px) and lower quality (60) to prioritize speed over quality.
 * On slow 4G (1.6 Mbps), every KB matters for LCP.
 */
export function LcpImagePreload({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null;

  const SUPABASE_PATTERN = /supabase\.co\/storage/;
  const isSupabaseUrl = SUPABASE_PATTERN.test(imageUrl);

  if (!isSupabaseUrl) {
    // Non-Supabase images: simple preload
    return (
      <link rel="preload" as="image" href={imageUrl} fetchPriority="high" />
    );
  }

  // CRITICAL: srcset widths must match Next.js deviceSizes [640, 750, 828, ...]
  // and quality must match cloudflareLoader default (60)
  // Otherwise preload won't match actual request = double download!
  return (
    <link
      rel="preload"
      as="image"
      fetchPriority="high"
      imageSrcSet={[
        `/cdn-cgi/image/width=640,quality=60,format=auto,fit=scale-down,metadata=none/${imageUrl} 640w`,
        `/cdn-cgi/image/width=750,quality=60,format=auto,fit=scale-down,metadata=none/${imageUrl} 750w`,
        `/cdn-cgi/image/width=828,quality=60,format=auto,fit=scale-down,metadata=none/${imageUrl} 828w`,
      ].join(", ")}
      imageSizes="100vw"
    />
  );
}
