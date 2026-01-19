import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Disabled for dynamic routes with uncached data
  // cacheComponents: true,

  // Explicitly expose server-side env vars
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY,
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
  },
};

export default withNextIntl(nextConfig);
