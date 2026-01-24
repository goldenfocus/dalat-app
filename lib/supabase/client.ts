import { createBrowserClient } from "@supabase/ssr";

// Singleton pattern for browser client - avoids creating multiple instances
// when multiple components call createClient()
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  // Return existing client if we're in browser and already have one
  if (typeof window !== "undefined" && browserClient) {
    return browserClient;
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  // Cache for browser reuse
  if (typeof window !== "undefined") {
    browserClient = client;
  }

  return client;
}
