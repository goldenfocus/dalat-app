"use client";

import { lazy, Suspense, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Only import DevTools in development
const ReactQueryDevtools =
  process.env.NODE_ENV === "development"
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((mod) => ({
          default: mod.ReactQueryDevtools,
        }))
      )
    : null;

/**
 * TanStack Query provider.
 *
 * Imported statically on purpose: it wraps every page, so loading it lazily
 * saved nothing. Hydration of the whole app waited on that extra chunk, and a
 * failed chunk request took down the entire page instead of one component.
 *
 * The Suspense boundary stays: client components that read search params
 * during static prerender rely on one existing above them.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <Suspense fallback={null}>
      <QueryClientProvider client={queryClient}>
        {children}
        {ReactQueryDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </Suspense>
        )}
      </QueryClientProvider>
    </Suspense>
  );
}
