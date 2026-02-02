import { createClient } from "@/lib/supabase/server";
import { Link } from "@/lib/i18n/routing";
import { Calendar, MapPin, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventDefaultImage } from "@/components/events/event-default-image";
import { formatInDaLat } from "@/lib/timezone";
import { isDefaultImageUrl } from "@/lib/media-utils";
import { decodeUnicodeEscapes } from "@/lib/utils";
import type { Event, Locale } from "@/lib/types";

// Fetch some events for the demo
async function getEvents(): Promise<Event[]> {
  const supabase = await createClient();

  // Use the same RPC as calendar page
  const { data, error } = await supabase.rpc("get_events_by_lifecycle", {
    p_lifecycle: "upcoming",
    p_limit: 6,
  });

  if (error) {
    console.error("Error fetching events:", error);
    return [];
  }

  return (data as Event[]) || [];
}

interface FramedCardProps {
  event: Event;
  locale: Locale;
  variant: "border" | "matte" | "shadow";
}

function FramedCard({ event, locale, variant }: FramedCardProps) {
  const hasCustomImage = !!event.image_url && !isDefaultImageUrl(event.image_url);
  const displayTitle = event.title;

  // Use raw URL for test page (CDN optimization only works in production)
  const imageUrl = event.image_url;

  // Different frame styles - made more visually distinct
  const frameStyles = {
    // Option A: No frame - image fills card edge-to-edge (current design baseline)
    border: "",
    // Option B: Thick matte frame like a picture frame
    matte: "p-3 sm:p-4 bg-zinc-200 dark:bg-zinc-700 rounded-xl",
    // Option C: Subtle padding with gradient/glow effect
    shadow: "p-2 sm:p-3 bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 rounded-xl",
  };

  const imageContainerStyles = {
    border: "rounded-xl overflow-hidden",
    matte: "rounded-lg overflow-hidden shadow-lg",
    shadow: "rounded-lg overflow-hidden ring-2 ring-white/20 dark:ring-black/30",
  };

  return (
    <Link href={`/events/${event.slug}`} className="block touch-manipulation">
      <Card className="overflow-hidden rounded-xl hover:border-foreground/20 hover:shadow-lg transition-all duration-200 active:scale-[0.98]">
        {/* Frame container */}
        <div className={frameStyles[variant]}>
          {/* Image container */}
          <div className={`relative aspect-[4/5] ${imageContainerStyles[variant]}`}>
            {hasCustomImage && imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={displayTitle}
                className={`absolute inset-0 w-full h-full ${event.image_fit === "contain" ? "object-contain" : "object-cover"}`}
                style={event.image_fit === "cover" && event.focal_point ? { objectPosition: event.focal_point } : undefined}
              />
            ) : (
              <EventDefaultImage
                title={displayTitle}
                className="object-cover w-full h-full"
              />
            )}
          </div>
        </div>

        {/* Info panel - always visible, no overlay */}
        <CardContent className="p-3 sm:p-4">
          <h3 className="font-semibold text-sm sm:text-base leading-snug mb-2 line-clamp-2 min-h-[2.5rem]">
            {displayTitle}
          </h3>

          <div className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>
                {formatInDaLat(event.starts_at, "EEE, MMM d", locale)} · {formatInDaLat(event.starts_at, "h:mm a", locale)}
              </span>
            </div>

            {event.location_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">{decodeUnicodeEscapes(event.location_name)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function CardFramesTestPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const events = await getEvents();

  if (events.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link
          href="/"
          className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-6 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
        <p className="text-muted-foreground">No events found. Check console for errors or ensure there are public events in the database.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/"
        className="-ml-3 flex items-center gap-2 text-muted-foreground hover:text-foreground active:text-foreground active:scale-95 transition-all px-3 py-2 rounded-lg mb-6 w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </Link>

      <h1 className="text-2xl font-bold mb-2">Card Frame Style Comparison</h1>
      <p className="text-muted-foreground mb-8">
        Pick your preferred frame style. Each shows the same events with different treatments.
      </p>

      {/* Style A: No Frame (baseline) */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-1">Option A: No Frame (Current Style)</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Image fills card edge-to-edge. This is similar to the current design.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {events.slice(0, 3).map((event) => (
            <FramedCard key={event.id} event={event} locale={locale as Locale} variant="border" />
          ))}
        </div>
      </section>

      {/* Style B: Thick Matte Frame */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-1">Option B: Picture Frame Matte</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Thick padding around image like a gallery frame. Makes any flyer look polished.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {events.slice(0, 3).map((event) => (
            <FramedCard key={event.id} event={event} locale={locale as Locale} variant="matte" />
          ))}
        </div>
      </section>

      {/* Style C: Gradient Frame */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-1">Option C: Subtle Gradient Frame</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Light padding with gradient background. Modern, adds depth without being heavy.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {events.slice(0, 3).map((event) => (
            <FramedCard key={event.id} event={event} locale={locale as Locale} variant="shadow" />
          ))}
        </div>
      </section>

      {/* Side by side comparison */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">Side-by-Side (same event)</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div>
            <p className="text-xs text-center text-muted-foreground mb-2">A: No Frame</p>
            <FramedCard event={events[0]} locale={locale as Locale} variant="border" />
          </div>
          <div>
            <p className="text-xs text-center text-muted-foreground mb-2">B: Matte</p>
            <FramedCard event={events[0]} locale={locale as Locale} variant="matte" />
          </div>
          <div>
            <p className="text-xs text-center text-muted-foreground mb-2">C: Gradient</p>
            <FramedCard event={events[0]} locale={locale as Locale} variant="shadow" />
          </div>
        </div>
      </section>
    </div>
  );
}
