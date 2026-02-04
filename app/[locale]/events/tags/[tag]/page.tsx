import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, type Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/events/event-card";
import { JsonLd, generateBreadcrumbSchema } from "@/lib/structured-data";
import { generateLocalizedMetadata } from "@/lib/metadata";
import {
  EVENT_TAGS,
  TAG_CONFIG,
  isValidTag,
  type EventTag,
  type TagIconName,
} from "@/lib/constants/event-tags";
import {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
  type LucideIcon,
} from "lucide-react";
import type { Event, EventCounts } from "@/lib/types";
import type { Metadata } from "next";

// Increase serverless function timeout
export const maxDuration = 60;

// Map icon names to components
const ICON_MAP: Record<TagIconName, LucideIcon> = {
  Music, Flower2, Brain, Dumbbell, Footprints, Palette,
  Camera, ChefHat, Wrench, GraduationCap, Compass, Mountain,
  Trophy, Users, Handshake, PartyPopper, Sparkles, UtensilsCrossed,
  Coffee, Store, Wine, Tent, Mic2, Frame, Theater, Film,
  Heart, Droplets, Baby, Sun, Home, Gift, HeartHandshake,
};

// Tag descriptions for hero sections
const TAG_DESCRIPTIONS: Record<EventTag, string> = {
  // Activities
  music: "Live performances, jam sessions, and musical gatherings in Da Lat",
  yoga: "Find your balance with yoga classes and retreats in the highlands",
  meditation: "Quiet the mind with meditation sessions in peaceful settings",
  fitness: "Stay active with fitness classes, runs, and workout sessions",
  dance: "Move your body with dance classes and social dancing events",
  art: "Explore creativity through art classes, exhibitions, and workshops",
  photography: "Capture Da Lat's beauty with photography walks and workshops",
  cooking: "Learn Vietnamese cuisine and international cooking techniques",
  workshop: "Hands-on learning experiences across various skills and crafts",
  class: "Educational sessions and skill-building classes for all levels",
  tour: "Guided explorations of Da Lat's hidden gems and famous spots",
  hiking: "Trek through pine forests, waterfalls, and mountain trails",
  sports: "Competitive and recreational sports activities for all skill levels",
  // Social
  meetup: "Connect with like-minded people at casual social gatherings",
  networking: "Build professional connections and grow your network",
  community: "Community-building events that bring people together",
  party: "Celebrate life with parties and festive gatherings",
  celebration: "Special occasions and milestone celebrations",
  // Food & Drink
  food: "Culinary experiences, food tours, and dining events",
  coffee: "Coffee tastings, barista workshops, and cafe culture",
  restaurant: "Special dining experiences at Da Lat's finest restaurants",
  market: "Local markets, pop-ups, and artisan vendor events",
  tasting: "Wine, coffee, and food tasting experiences",
  // Culture
  festival: "Cultural festivals and large-scale community celebrations",
  concert: "Live music concerts featuring local and visiting artists",
  exhibition: "Art exhibitions, gallery shows, and cultural displays",
  performance: "Theater, dance performances, and live entertainment",
  film: "Movie screenings, film festivals, and cinema events",
  // Wellness
  wellness: "Holistic wellness experiences for mind, body, and spirit",
  retreat: "Multi-day retreats for deep relaxation and transformation",
  spa: "Spa days, wellness treatments, and self-care experiences",
  healing: "Healing practices, sound baths, and therapeutic sessions",
  // Other
  kids: "Family-friendly activities designed for children",
  family: "Events welcoming the whole family to participate together",
  outdoor: "Get outside and explore Da Lat's natural beauty",
  indoor: "Indoor activities perfect for any weather",
  free: "Free events open to everyone in the community",
  charity: "Give back through charitable events and fundraisers",
};

type PageProps = {
  params: Promise<{ locale: Locale; tag: string }>;
};

export async function generateStaticParams() {
  const locales: Locale[] = ["en", "vi", "ko", "zh", "ru", "fr", "ja", "ms", "th", "de", "es", "id"];
  return locales.flatMap((locale) =>
    EVENT_TAGS.map((tag) => ({ locale, tag }))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, tag } = await params;

  if (!isValidTag(tag)) {
    return { title: "Not Found" };
  }

  const config = TAG_CONFIG[tag as EventTag];
  const description = TAG_DESCRIPTIONS[tag as EventTag];

  return generateLocalizedMetadata({
    locale,
    path: `/events/tags/${tag}`,
    title: `${config.label} Events`,
    description,
    keywords: ["events", config.label.toLowerCase(), "Da Lat", "activities"],
  });
}

async function getEventsByTag(tag: EventTag) {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .contains("ai_tags", [tag])
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Error fetching events by tag:", error);
    return [];
  }

  return events as Event[];
}

async function getEventCounts(eventIds: string[]) {
  if (eventIds.length === 0) return {};

  const supabase = await createClient();
  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("event_id, status, plus_ones")
    .in("event_id", eventIds);

  const counts: Record<string, EventCounts> = {};

  for (const eventId of eventIds) {
    const eventRsvps = rsvps?.filter((r) => r.event_id === eventId) || [];
    const goingRsvps = eventRsvps.filter((r) => r.status === "going");
    const waitlistRsvps = eventRsvps.filter((r) => r.status === "waitlist");
    const interestedRsvps = eventRsvps.filter((r) => r.status === "interested");

    counts[eventId] = {
      event_id: eventId,
      going_count: goingRsvps.length,
      waitlist_count: waitlistRsvps.length,
      going_spots: goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0),
      interested_count: interestedRsvps.length,
    };
  }

  return counts;
}

export default async function TagPage({ params }: PageProps) {
  const { locale, tag } = await params;
  setRequestLocale(locale);

  // Validate tag
  if (!isValidTag(tag)) {
    notFound();
  }

  const validTag = tag as EventTag;
  const config = TAG_CONFIG[validTag];
  const description = TAG_DESCRIPTIONS[validTag];
  const IconComponent = ICON_MAP[config.icon];

  const _t = await getTranslations("archive");

  const events = await getEventsByTag(validTag);
  const eventIds = events.map((e) => e.id);
  const counts = await getEventCounts(eventIds);

  // Breadcrumb structured data
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Events", url: "/" },
      { name: config.label, url: `/events/tags/${tag}` },
    ],
    locale
  );

  // ItemList structured data
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${config.label} Events in Da Lat`,
    description,
    numberOfItems: events.length,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `https://dalat.app/${locale}/events/${event.slug}`,
      name: event.title,
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema, itemListSchema]} />

      <main className="min-h-screen flex flex-col">
        {/* Content */}
        <div className="flex-1 container max-w-4xl mx-auto px-4 py-8">
          {/* Hero section */}
          <div className="mb-8 pb-6 border-b border-border/50">
            <div className="flex items-start gap-4 mb-3">
              <div className="p-3 rounded-xl bg-muted/50">
                <IconComponent className="w-8 h-8 text-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold mb-1">{config.label} Events</h1>
                <p className="text-muted-foreground">{description}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {events.length === 0
                ? "No upcoming events"
                : `${events.length} upcoming ${events.length === 1 ? "event" : "events"}`}
            </p>
          </div>

          {/* Events grid */}
          {events.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard key={event.id} event={event} counts={counts[event.id]} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mb-4 flex justify-center">
                <div className="p-4 rounded-full bg-muted/30">
                  <IconComponent className="w-12 h-12 text-muted-foreground/50" />
                </div>
              </div>
              <p className="mb-2 font-medium">No upcoming {config.label.toLowerCase()} events</p>
              <p className="mb-6 text-sm">Check back soon for new events in this category</p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                Browse all events
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

// ISR: Revalidate every hour
export const revalidate = 3600;
