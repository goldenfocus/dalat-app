import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

const cloudflareConfig = defineCloudflareConfig({
  // ISR/unstable_cache pages persist in R2 (bucket: dalat-app-cache)
  incrementalCache: r2IncrementalCache,
  // revalidateTag support (used by /api/revalidate and translations)
  tagCache: d1NextTagCache,
  // Durable Object queue for ISR revalidation
  queue: doQueue,
});

export default {
  ...cloudflareConfig,
  // The repository keeps a bun.lock for local users, but production builds
  // run in environments where only Node/npm is guaranteed to be installed.
  buildCommand: "npm run build",
};
