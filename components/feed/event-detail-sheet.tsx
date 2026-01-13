"use client";

import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, X } from "lucide-react";
import { useLocale } from "next-intl";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { formatInDaLat } from "@/lib/timezone";
import { triggerHaptic } from "@/lib/haptics";
import type { Locale } from "@/lib/types";

interface EventDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventSlug: string;
  eventTitle: string;
  eventImageUrl: string | null;
  eventStartsAt: string;
  eventLocationName: string | null;
}

/**
 * Bottom sheet showing event details.
 * Slides up from bottom with event info and a CTA to view the full event.
 */
export function EventDetailSheet({
  open,
  onOpenChange,
  eventSlug,
  eventTitle,
  eventImageUrl,
  eventStartsAt,
  eventLocationName,
}: EventDetailSheetProps) {
  const locale = useLocale() as Locale;

  const handleViewEvent = () => {
    triggerHaptic("selection");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/40" />
        <DialogPrimitive.Content
          className="fixed bottom-0 inset-x-0 z-50 bg-background rounded-t-2xl max-h-[80vh] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
          aria-describedby={undefined}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Close button */}
          <DialogPrimitive.Close className="absolute right-4 top-4 p-2 -m-2 rounded-full opacity-70 hover:opacity-100 transition-opacity">
            <X className="w-5 h-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          <div className="p-4 pb-8 space-y-4">
            {/* Event image */}
            {eventImageUrl && (
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <img
                  src={eventImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Title - required for accessibility */}
            <DialogPrimitive.Title className="text-xl font-bold line-clamp-2">
              {eventTitle}
            </DialogPrimitive.Title>

            {/* Meta info */}
            <div className="space-y-2 text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">
                  {formatInDaLat(eventStartsAt, "EEEE, MMMM d", locale)} &middot;{" "}
                  {formatInDaLat(eventStartsAt, "h:mm a", locale)}
                </span>
              </div>

              {eventLocationName && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm line-clamp-1">{eventLocationName}</span>
                </div>
              )}
            </div>

            {/* CTA */}
            <Link href={`/events/${eventSlug}`} onClick={handleViewEvent}>
              <Button className="w-full" size="lg">
                View Event
              </Button>
            </Link>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
