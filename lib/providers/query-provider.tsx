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
 * The @tanstack/react-query library (~70KB) is loaded asynchronously.
 * The Suspense fallback MUST be null (not {children}): rendering children
 * without a QueryClient crashes any component using useQuery — fatal during
 * static prerender (broke `next build` on /[locale]/moments). The import
 * resolves in a microtask and prerender waits for allReady, so the final
 * HTML always contains the real content, never the fallback.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
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
