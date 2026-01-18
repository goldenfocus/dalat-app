/**
 * ⚠️  DEPRECATED - DO NOT USE THIS FILE
 *
 * Next.js 16 renamed middleware to proxy.
 * All middleware logic should go in proxy.ts
 *
 * @see proxy.ts
 */

// Re-export from proxy.ts for backwards compatibility
export { proxy as middleware, config } from "./proxy";
