"use client";

import { Link } from "@/lib/i18n/routing";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { EventGalleryHeading } from "./event-gallery-heading";
import { MomentCard } from "./moment-card";
import { MomentsLightboxProvider, useMomentsLightbox } from "./moments-lightbox-provider";
import type { DiscoveryGallery } from "@/lib/moments/discovery-galleries";
import type { LightboxMoment } from "./moment-lightbox";

interface DiscoveryEventMomentsGroupProps {
  group: DiscoveryGallery;
  commentCounts?: Map<string, number>;
}

function DiscoveryGalleryPreview({ group, commentCounts }: DiscoveryEventMomentsGroupProps) {
  const { openLightbox } = useMomentsLightbox();
  const remainingCount = group.total_moment_count - group.moments.length;

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {group.moments.map((moment, index) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          eventSlug={group.event_slug}
          from="discovery"
          commentCount={commentCounts?.get(moment.id)}
          onLightboxOpen={() => openLightbox(index)}
          galleryOverflow={index === group.moments.length - 1 && remainingCount > 0 ? remainingCount : undefined}
        />
      ))}
    </div>
  );
}

export function DiscoveryEventMomentsGroup({ group, commentCounts }: DiscoveryEventMomentsGroupProps) {
  const t = useTranslations("moments");
  const locale = useLocale();
  const lightboxMoments: LightboxMoment[] = group.moments.map((moment) => ({
    ...moment,
    video_status: moment.video_status as LightboxMoment["video_status"],
  }));

  return (
    <article className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4">
      <EventGalleryHeading
        slug={group.event_slug}
        title={group.event_title}
        translatedTitle={group.translatedTitle}
        description={group.description}
        translatedDescription={group.translatedDescription}
        imageUrl={group.event_image_url}
        fallbackPhoto={group.moments.find((moment) => moment.content_type === "photo" && moment.media_url)}
        date={group.event_starts_at}
        locationName={group.event_location_name}
        locale={locale}
      />
      <MomentsLightboxProvider moments={lightboxMoments} eventSlug={group.event_slug} autoplayPlaylist={false}>
        <DiscoveryGalleryPreview group={group} commentCounts={commentCounts} />
      </MomentsLightboxProvider>
      <Link
        href={`/events/${group.event_slug}/moments`}
        className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium text-primary hover:bg-muted"
      >
        {t("viewAll")}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
