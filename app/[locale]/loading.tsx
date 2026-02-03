/**
 * Homepage loading skeleton for instant visual feedback.
 * Displays while React hydrates, reducing perceived load time.
 * Note: SiteHeader is rendered globally in locale layout, not here.
 */
export default function HomeLoading() {
  return (
    <main className="min-h-screen flex flex-col pb-20 lg:pb-0">
      {/* Hero skeleton - matches HeroSection height */}
      <div className="h-32 bg-gradient-to-b from-teal-500/5 to-transparent" />

      {/* Main content */}
      <div className="flex-1 container max-w-4xl mx-auto px-4 py-4">
        {/* Tabs + Search skeleton */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="h-10 w-64 bg-muted animate-pulse rounded-lg" />
          <div className="hidden lg:block h-10 w-64 bg-muted animate-pulse rounded-lg" />
        </div>

        {/* Event grid skeleton - matches 2-column layout */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-card">
              {/* Image skeleton - matches aspect-[4/5] */}
              <div className="w-full aspect-[4/5] bg-muted animate-pulse" />
              {/* Text area skeleton */}
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-muted animate-pulse rounded" />
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
