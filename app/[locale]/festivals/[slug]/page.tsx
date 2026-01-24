import { notFound } from "next/navigation";
import { Link } from "@/lib/i18n/routing";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  ExternalLink,
  Globe,
  Share2,
  BadgeCheck,
} from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Festival, FestivalOrganizer, FestivalEvent, FestivalUpdate, Locale } from "@/lib/types";
import { FestivalTabs } from "@/components/festivals/festival-tabs";
import { generateFestivalMetadata } from "@/lib/metadata";
import { JsonLd, generateFestivalSchema, generateBreadcrumbSchema } from "@/lib/structured-data";

interface FestivalPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

async function getFestival(slug: string) {
  const supabase = await createClient();

  // Get festival with organizers
  const { data: festival, error } = await supabase
    .from("festivals")
    .select(
      `
      *,
      festival_organizers (
        *,
        organizers (*)
      )
    `
    )
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !festival) {
    return null;
  }

  return festival as Festival & {
    festival_organizers: (FestivalOrganizer & {
      organizers: NonNullable<FestivalOrganizer["organizers"]>;
    })[];
  };
}

async function getFestivalEvents(festivalId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("festival_events")
    .select(
      `
      *,
      events (
        *,
        organizers (*)
      )
    `
    )
    .eq("festival_id", festivalId)
    .order("sort_order", { ascending: true });

  return (data ?? []) as (FestivalEvent & {
    events: NonNullable<FestivalEvent["events"]>;
  })[];
}

async function getFestivalUpdates(festivalId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("festival_updates")
    .select("*")
    .eq("festival_id", festivalId)
    .order("posted_at", { ascending: false });

  return (data ?? []) as FestivalUpdate[];
}

// Generate SEO metadata for festival pages
export async function generateMetadata({ params }: FestivalPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const festival = await getFestival(slug);

  if (!festival) {
    return { title: "Festival not found" };
  }

  const events = await getFestivalEvents(festival.id);
  return generateFestivalMetadata(festival, locale as Locale, events.length);
}

export default async function FestivalPage({ params }: FestivalPageProps) {
  const { slug } = await params;
  const [tCommon, tEvents] = await Promise.all([
    getTranslations("common"),
    getTranslations("events"),
  ]);
  const festival = await getFestival(slug);

  if (!festival) {
    notFound();
  }

  const [events, updates] = await Promise.all([
    getFestivalEvents(festival.id),
    getFestivalUpdates(festival.id),
  ]);

  // Format dates
  const startDate = new Date(festival.start_date);
  const endDate = new Date(festival.end_date);
  const dateRange = `${startDate.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "long",
  })} - ${endDate.toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;

  // Get lead organizer
  const _leadOrganizer = festival.festival_organizers?.find(
    (fo) => fo.role === "lead"
  );

  // Separate official and community events
  const officialEvents = events.filter(
    (e) => e.event_type === "official_program"
  );
  const communityEvents = events.filter(
    (e) => e.event_type === "community_side_event"
  );

  // Generate structured data for SEO and AEO
  const locale = await getLocale();
  const festivalSchema = generateFestivalSchema(festival, locale, events.length);
  const breadcrumbSchema = generateBreadcrumbSchema(
    [
      { name: "Home", url: "/" },
      { name: "Festivals", url: "/festivals" },
      { name: festival.title, url: `/festivals/${festival.slug}` },
    ],
    locale
  );

  return (
    <div className="min-h-screen">
      {/* JSON-LD Structured Data for SEO/AEO */}
      <JsonLd data={[festivalSchema, breadcrumbSchema]} />
      {/* Hero Section */}
      <div className="relative">
        {/* Cover Image */}
        {festival.cover_image_url ? (
          <div className="relative h-[300px] sm:h-[400px] w-full">
            <Image
              src={festival.cover_image_url}
              alt={festival.title}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        ) : (
          <div className="h-[200px] bg-gradient-to-br from-primary/20 to-primary/5" />
        )}

        {/* Back Button */}
        <div className="absolute top-4 left-4">
          <Link
            href="/"
            className="-ml-3 flex items-center gap-2 text-white/90 hover:text-white active:text-white active:scale-95 transition-all px-3 py-2 rounded-lg bg-black/20 backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{tCommon("back")}</span>
          </Link>
        </div>

        {/* Festival Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="container max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">
                Official Festival
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">
              {festival.title}
            </h1>
            {festival.subtitle && (
              <p className="text-lg text-muted-foreground mb-4">
                {festival.subtitle}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{dateRange}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{festival.location_city}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Organizers Row */}
        {festival.festival_organizers &&
          festival.festival_organizers.length > 0 && (
            <div className="mb-8 p-4 rounded-lg border bg-card">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                {tEvents("organizedBy")}
              </p>
              <div className="flex flex-wrap gap-4">
                {festival.festival_organizers.filter((fo) => fo.organizers).map((fo) => (
                  <div key={fo.organizer_id} className="flex items-center gap-3">
                    {fo.organizers?.logo_url ? (
                      <Image
                        src={fo.organizers.logo_url}
                        alt={fo.organizers.name}
                        width={40}
                        height={40}
                        className="rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">
                          {fo.organizers?.name[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{fo.organizers?.name}</span>
                        {fo.organizers?.is_verified && (
                          <BadgeCheck className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        {fo.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Links Row */}
        <div className="mb-8 flex flex-wrap gap-3">
          {festival.website_url && (
            <a
              href={festival.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
            >
              <Globe className="h-4 w-4" />
              Website
            </a>
          )}
          {festival.facebook_url && (
            <a
              href={festival.facebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Facebook
            </a>
          )}
          <button className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm">
            <Share2 className="h-4 w-4" />
            Share
          </button>
        </div>

        {/* Hashtags */}
        {festival.hashtags && festival.hashtags.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-2">
            {festival.hashtags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tabs: Program / Updates / About */}
        <FestivalTabs
          festival={festival}
          officialEvents={officialEvents}
          communityEvents={communityEvents}
          updates={updates}
        />
      </div>
    </div>
  );
}
