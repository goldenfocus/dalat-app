import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Disabled for dynamic routes with uncached data
  // cacheComponents: true,

  // Explicitly expose server-side env vars
  // (Vercel should do this automatically, but being explicit helps debugging)
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
};

export default withNextIntl(nextConfig);
