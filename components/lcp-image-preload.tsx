/**
 * LCP Image Preload Component
 *
 * Preloads the hero image for faster LCP on mobile devices.
 * Uses quality=75 (Next.js default) for optimal visual quality and perceived performance.
 * Preload widths match Next.js deviceSizes to prevent double downloads.
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

  // CRITICAL: srcset widths and quality MUST match cloudflareLoader defaults
  // Widths: 640/750/828px match Next.js deviceSizes for mobile
  // Quality: 75 matches cloudflareLoader default
  // Otherwise preload won't match actual request = double download!
  return (
    <link
      rel="preload"
      as="image"
      fetchPriority="high"
      imageSrcSet={[
        `/cdn-cgi/image/width=640,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 640w`,
        `/cdn-cgi/image/width=750,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 750w`,
        `/cdn-cgi/image/width=828,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 828w`,
      ].join(", ")}
      imageSizes="100vw"
    />
  );
}
