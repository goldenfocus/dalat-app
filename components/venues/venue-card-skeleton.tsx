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
      {/* Cover image skeleton with logo overlay position */}
      <div className="relative aspect-[2/1]">
        <Skeleton className="w-full h-full rounded-none" />
        {/* Logo skeleton overlay */}
        <div className="absolute bottom-3 left-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
        </div>
      </div>

      <CardContent className="p-4">
        <div className="space-y-1.5">
          {/* Name */}
          <Skeleton className="h-5 w-3/4" />
          {/* Type */}
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
