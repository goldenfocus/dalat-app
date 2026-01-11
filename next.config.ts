import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Disabled for dynamic routes with uncached data
  // cacheComponents: true,
};

export default withNextIntl(nextConfig);
