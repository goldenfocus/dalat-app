import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for filter panel
 * Shows while filter options are being loaded
 */
export function FilterPanelSkeleton() {
    return (
        <div className="p-6 space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between mb-6">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-9 w-9 rounded-full" />
            </div>

            {/* Search skeleton */}
            <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Categories skeleton */}
            <div className="space-y-3">
                <Skeleton className="h-5 w-24" />
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center space-x-3">
                            <Skeleton className="h-4 w-4 rounded" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Date range skeleton */}
            <div className="space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Price skeleton */}
            <div className="space-y-3">
                <Skeleton className="h-5 w-16" />
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-2">
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                ))}
            </div>

            {/* Distance skeleton */}
            <div className="space-y-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-10 w-full rounded-lg" />
            </div>

            {/* Action buttons skeleton */}
            <div className="flex gap-3 pt-4 border-t">
                <Skeleton className="h-11 flex-1 rounded-lg" />
                <Skeleton className="h-11 flex-1 rounded-lg" />
            </div>
        </div>
    );
}
