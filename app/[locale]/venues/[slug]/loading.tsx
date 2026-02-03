import { Skeleton } from "@/components/ui/skeleton";

export default function VenueLoading() {
  return (
    <main className="min-h-screen pb-8">
      {/* Cover photo skeleton */}
      <Skeleton className="w-full aspect-[2/1] sm:aspect-[3/1]" />

      <div className="container max-w-4xl mx-auto px-4">
        {/* Venue header skeleton */}
        <div className="flex items-start gap-4 sm:gap-6 py-6 -mt-12 relative">
          {/* Logo skeleton */}
          <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-4 border-background" />

          <div className="flex-1 pt-12 sm:pt-14">
            {/* Name skeleton */}
            <Skeleton className="h-8 w-48 mb-2" />

            {/* Type and status badges */}
            <div className="flex items-center gap-3 mt-2">
              <Skeleton className="h-6 w-20 rounded" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>

            {/* Address skeleton */}
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>

        {/* Action buttons skeleton */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Skeleton className="h-11 w-36 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg" />
          <Skeleton className="h-11 w-32 rounded-lg" />
        </div>

        {/* Events section skeleton */}
        <section className="mb-8">
          <Skeleton className="h-6 w-40 mb-4" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-lg border bg-card overflow-hidden">
                <Skeleton className="w-full aspect-[2/1]" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* About section skeleton */}
        <section className="mb-8">
          <Skeleton className="h-6 w-20 mb-3" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </section>

        {/* Amenities skeleton */}
        <section className="mb-8">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </section>

        {/* Hours skeleton */}
        <section className="mb-8">
          <Skeleton className="h-6 w-24 mb-3" />
          <div className="bg-muted/30 rounded-lg p-4 space-y-2">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="flex justify-between py-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
