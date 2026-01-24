"use client";

import { lazy, Suspense, type ReactNode } from "react";

// Dynamically import TanStack Query to enable code splitting
// The library loads async but the provider is always rendered (via Suspense)
const LazyQueryClientProvider = lazy(() =>
  import("@tanstack/react-query").then((mod) => {
    // Create a stable QueryClient outside the component to avoid re-creation
    const queryClient = new mod.QueryClient({
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
    });

    return {
      default: function StableQueryProvider({ children }: { children: ReactNode }) {
        return (
          <mod.QueryClientProvider client={queryClient}>
            {children}
          </mod.QueryClientProvider>
        );
      },
    };
  })
);

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
 * TanStack Query provider with code splitting.
 *
 * The @tanstack/react-query library (~70KB) is loaded asynchronously,
 * but children are rendered immediately via Suspense fallback.
 * This improves initial page load for pages that don't use React Query.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <LazyQueryClientProvider>
        {children}
        {ReactQueryDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </Suspense>
        )}
      </LazyQueryClientProvider>
    </Suspense>
  );
}
