"use client";

import { useTranslations } from "next-intl";
import { MomentCard } from "./moment-card";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import { Camera } from "lucide-react";
import type { MomentWithProfile } from "@/lib/types";

interface MomentGridProps {
  moments: MomentWithProfile[];
  emptyState?: boolean;
  /** Event slug for URL generation */
  eventSlug?: string;
  /** Enable lightbox mode (modal instead of page navigation) */
  enableLightbox?: boolean;
}

export function MomentGrid({ moments, emptyState = true, eventSlug, enableLightbox = false }: MomentGridProps) {
  const t = useTranslations("moments");

  if (moments.length === 0 && emptyState) {
    return (
      <div className="text-center py-12">
        <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg mb-2">{t("noMoments")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("beFirst")}
        </p>
      </div>
    );
  }

  // Lightbox-enabled grid
  if (enableLightbox) {
    return (
      <MomentsLightboxProvider moments={moments} eventSlug={eventSlug}>
        <MomentGridInner moments={moments} eventSlug={eventSlug} />
      </MomentsLightboxProvider>
    );
  }

  // Standard grid with link navigation (SEO-friendly)
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {moments.map((moment) => (
        <MomentCard key={moment.id} moment={moment} eventSlug={eventSlug} />
      ))}
    </div>
  );
}

/** Inner grid component that can use the lightbox context */
function MomentGridInner({ moments, eventSlug }: { moments: MomentWithProfile[]; eventSlug?: string }) {
  const { openLightbox } = useMomentsLightbox();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {moments.map((moment, index) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          eventSlug={eventSlug}
          onLightboxOpen={() => openLightbox(index)}
        />
      ))}
    </div>
  );
}
