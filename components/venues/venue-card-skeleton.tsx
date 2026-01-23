"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface VenueCardSkeletonProps {
  className?: string;
}

export function VenueCardSkeleton({ className }: VenueCardSkeletonProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Cover image skeleton */}
      <Skeleton className="aspect-[2/1] w-full rounded-none" />

      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Logo skeleton */}
          <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />

          <div className="flex-1 min-w-0 space-y-2">
            {/* Name */}
            <Skeleton className="h-5 w-3/4" />
            {/* Type badge */}
            <Skeleton className="h-5 w-16 rounded" />
            {/* Address */}
            <Skeleton className="h-3 w-full" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
