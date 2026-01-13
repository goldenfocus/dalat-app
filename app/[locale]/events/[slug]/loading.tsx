import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function EventLoading() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container flex h-14 max-w-4xl items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </div>
        </div>
      </nav>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content skeleton */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image skeleton */}
            <Skeleton className="w-full aspect-video rounded-lg" />

            {/* Title and description */}
            <div className="space-y-4">
              <Skeleton className="h-9 w-3/4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>

            {/* Attendees skeleton */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="w-10 h-10 rounded-full" />
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar skeleton */}
          <div className="space-y-4">
            {/* RSVP card */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-5 h-5 rounded" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Skeleton className="w-5 h-5 rounded" />
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Skeleton className="w-5 h-5 rounded" />
                  <Skeleton className="h-5 w-20" />
                </div>

                <hr />

                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </CardContent>
            </Card>

            {/* Organizer card */}
            <Card>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full" />
                  <Skeleton className="h-5 w-28" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
