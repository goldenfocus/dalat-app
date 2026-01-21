/**
 * LCP Image Preload Component
 *
 * Generates a <link rel="preload"> tag for the Largest Contentful Paint image.
 * This tells the browser to fetch the hero image early, before parsing CSS/JS.
 *
 * Key PageSpeed impact:
 * - Can reduce LCP by 100-500ms
 * - Browser fetches image in parallel with other resources
 * - Critical for achieving 100% PageSpeed score
 */
export function LcpImagePreload({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null;

  // Generate the optimized URL through Cloudflare Image Resizing
  // Match the sizes used in immersive-image.tsx for consistency
  const SUPABASE_PATTERN = /supabase\.co\/storage/;
  const isSupabaseUrl = SUPABASE_PATTERN.test(imageUrl);

  // For mobile LCP (100vw on phones), optimize for 640px width
  // Most mobile devices are under 640px, so this reduces initial payload
  const optimizedUrl = isSupabaseUrl
    ? `/cdn-cgi/image/width=640,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl}`
    : imageUrl;

  return (
    <link
      rel="preload"
      as="image"
      href={optimizedUrl}
      // fetchpriority="high" tells browser this is critical
      fetchPriority="high"
      // imageSrcSet for responsive preloading
      imageSrcSet={
        isSupabaseUrl
          ? [
              `/cdn-cgi/image/width=640,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 640w`,
              `/cdn-cgi/image/width=750,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 750w`,
              `/cdn-cgi/image/width=1080,quality=75,format=auto,fit=scale-down,metadata=none/${imageUrl} 1080w`,
            ].join(", ")
          : undefined
      }
      imageSizes="(max-width: 768px) 100vw, 50vw"
    />
  );
}
