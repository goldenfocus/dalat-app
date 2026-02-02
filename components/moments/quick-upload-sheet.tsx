"use client";

import { useTranslations } from "next-intl";
import { Calendar, MapPin, ChevronRight, Camera, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cloudflareLoader } from "@/lib/image-cdn";
import { formatInDaLat } from "@/lib/timezone";
import type { RecentEventForUpload } from "@/lib/types";

interface QuickUploadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  recentEvents: RecentEventForUpload[];
  isLoading: boolean;
  onEventSelect: (event: RecentEventForUpload) => void;
}

/**
 * Bottom sheet style dialog for selecting which event to upload moments to.
 * Shows recent events the user attended.
 */
export function QuickUploadSheet({
  isOpen,
  onClose,
  recentEvents,
  isLoading,
  onEventSelect,
}: QuickUploadSheetProps) {
  const t = useTranslations();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-md fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none sm:rounded-lg sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 max-h-[80vh] overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            {t("moments.fab.selectEvent")}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[60vh] -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("moments.fab.noRecentEvents")}</p>
              <p className="text-sm mt-2">{t("moments.fab.rsvpHint")}</p>
            </div>
          ) : (
            <div className="space-y-2 pb-safe">
              <p className="text-sm text-muted-foreground mb-4">
                {t("moments.fab.recentEvents")}
              </p>
              {recentEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => event.can_post_moments && onEventSelect(event)}
                  disabled={!event.can_post_moments}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 active:bg-muted transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {/* Event image */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {event.image_url ? (
                      <img
                        src={cloudflareLoader({
                          src: event.image_url,
                          width: 112,
                          quality: 80,
                        })}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Event info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{event.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">
                        {formatInDaLat(event.starts_at, "EEE, MMM d")}
                      </span>
                    </div>
                    {event.location_name && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{event.location_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  {event.can_post_moments && (
                    <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
