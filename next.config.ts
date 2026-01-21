import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Explicitly expose server-side env vars
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
  },

  // Configure Next.js Image optimization for external domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Enable modern image formats for better compression
    formats: ["image/avif", "image/webp"],
    // Responsive breakpoints for srcset generation
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Minimize image quality for faster loading (still good quality)
    minimumCacheTTL: 31536000, // Cache images for 1 year
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Optimize production builds
  compiler: {
    // Remove console.log in production (except errors)
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  // Enable experimental features for better performance
  experimental: {
    // Optimize package imports for tree-shaking
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-alert-dialog",
      "recharts",
      "react-hook-form",
    ],
    // Enable optimized CSS output
    optimizeCss: true,
    // Enable faster builds with granular chunking
    webpackBuildWorker: true,
  },

  // Production-only optimizations
  ...(process.env.NODE_ENV === "production" && {
    compress: true, // Enable gzip compression
    poweredByHeader: false, // Remove X-Powered-By header
    generateEtags: true, // Generate ETags for caching
  }),

  // HTTP headers for caching static assets
  async headers() {
    return [
      {
        // Static assets - cache for 1 year (immutable)
        source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // JS/CSS bundles - cache with revalidation
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Manifest and service worker - short cache for updates
        source: "/(manifest.json|sw.js)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
