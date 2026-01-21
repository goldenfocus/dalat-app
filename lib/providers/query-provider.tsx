"use client";

import { useState, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Dynamic import to exclude DevTools from production bundle (~26KB savings)
const ReactQueryDevtools = lazy(() =>
  import("@tanstack/react-query-devtools").then((mod) => ({
    default: mod.ReactQueryDevtools,
  }))
);

/**
 * TanStack Query provider for client-side data caching.
 *
 * Configured with:
 * - 1 minute stale time (data considered fresh)
 * - 5 minute garbage collection time
 * - Disabled refetch on window focus (reduces unnecessary requests)
 * - Single retry on failure
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is fresh for 1 minute before becoming stale
            staleTime: 60_000,
            // Keep unused data in cache for 5 minutes
            gcTime: 5 * 60_000,
            // Don't refetch when window regains focus (reduces load)
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
            // Refetch on reconnect for fresh data
            refetchOnReconnect: true,
          },
          mutations: {
            // Don't retry failed mutations
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
