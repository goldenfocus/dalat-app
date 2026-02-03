import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ProfileContent } from "./profile-content";
import { OrganizerContent } from "./organizer-content";
import { VenueContent } from "./venue-content";
import { generateProfileMetadata, generateOrganizerMetadata, generateVenueMetadata } from "@/lib/metadata";
import type { Profile, Organizer, Locale } from "@/lib/types";
import { getTranslationsWithFallback } from "@/lib/translations";

interface PageProps {
  params: Promise<{ slug: string; locale: string }>;
}

interface SlugResolution {
  found: boolean;
  entity_type?: "venue" | "organizer" | "profile";
  entity_id?: string;
  is_redirect?: boolean;
  canonical_slug?: string;
}

async function resolveSlug(slug: string): Promise<SlugResolution> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_unified_slug", {
    p_slug: slug,
  });

  if (error) {
    console.error("Error resolving slug:", error);
    return { found: false };
  }

  return data as SlugResolution;
}

// Fallback resolution for when unified_slugs table doesn't have the entry yet
// This handles the transition period before data migration is complete
async function fallbackResolveSlug(slug: string): Promise<SlugResolution> {
  const supabase = await createClient();

  // Try profile by username first
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", slug)
    .single();

  if (profile) {
    return {
      found: true,
      entity_type: "profile",
      entity_id: profile.id,
      is_redirect: false,
      canonical_slug: slug,
    };
  }

  // Try profile by ID (for profiles without username)
  const { data: profileById } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", slug)
    .single();

  if (profileById) {
    return {
      found: true,
      entity_type: "profile",
      entity_id: profileById.id,
      is_redirect: false,
      canonical_slug: slug,
    };
  }

  // Try venue
  const { data: venue } = await supabase
    .from("venues")
    .select("id, slug")
    .eq("slug", slug)
    .single();

  if (venue) {
    return {
      found: true,
      entity_type: "venue",
      entity_id: venue.id,
      is_redirect: false,
      canonical_slug: venue.slug,
    };
  }

  // Try organizer
  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, slug")
    .eq("slug", slug)
    .single();

  if (organizer) {
    return {
      found: true,
      entity_type: "organizer",
      entity_id: organizer.id,
      is_redirect: false,
      canonical_slug: organizer.slug,
    };
  }

  return { found: false };
}

// Metadata generation
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeURIComponent(rawSlug).replace(/^@/, "").toLowerCase();

  // Try unified resolution first, fall back to direct lookup
  let resolution = await resolveSlug(slug);
  if (!resolution.found) {
    resolution = await fallbackResolveSlug(slug);
  }

  if (!resolution.found || !resolution.entity_type || !resolution.entity_id) {
    return { title: "Not found" };
  }

  const supabase = await createClient();

  switch (resolution.entity_type) {
    case "profile": {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", resolution.entity_id)
        .single();

      if (!profile) return { title: "Profile not found" };

      const { data: events } = await supabase
        .from("events")
        .select("id")
        .eq("created_by", profile.id)
        .eq("status", "published");

      return generateProfileMetadata(profile as Profile, locale as Locale, events?.length ?? 0);
    }

    case "organizer": {
      const { data: organizer } = await supabase
        .from("organizers")
        .select("*")
        .eq("id", resolution.entity_id)
        .single();

      if (!organizer) return { title: "Organizer not found" };

      const { data: events } = await supabase
        .from("events")
        .select("id")
        .eq("organizer_id", organizer.id)
        .eq("status", "published");

      return generateOrganizerMetadata(organizer as Organizer, locale as Locale, events?.length ?? 0);
    }

    case "venue": {
      const { data: venue } = await supabase
        .from("venues")
        .select("*")
        .eq("id", resolution.entity_id)
        .single();

      if (!venue) return { title: "Venue not found" };

      // Fetch translations for metadata
      const venueTranslations = await getTranslationsWithFallback(
        "venue",
        venue.id,
        locale as Locale,
        {
          title: venue.name,
          description: venue.description,
          text_content: null,
          bio: null,
          story_content: null,
          technical_content: null,
          meta_description: null,
        }
      );

      const { data: events } = await supabase
        .from("events")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString());

      return generateVenueMetadata(
        { ...venue, description: venueTranslations.description ?? venue.description },
        locale as Locale,
        events?.length ?? 0
      );
    }

    default:
      return { title: "Not found" };
  }
}

export default async function UnifiedSlugPage({ params }: PageProps) {
  const { slug: rawSlug, locale } = await params;
  // Handle @ prefix (for profile URLs like /@username)
  const slug = decodeURIComponent(rawSlug).replace(/^@/, "").toLowerCase();

  // Try unified resolution first, fall back to direct lookup
  let resolution = await resolveSlug(slug);
  if (!resolution.found) {
    resolution = await fallbackResolveSlug(slug);
  }

  if (!resolution.found || !resolution.entity_type || !resolution.entity_id) {
    notFound();
  }

  // Handle redirects (non-primary slugs that should redirect to canonical)
  if (resolution.is_redirect && resolution.canonical_slug && resolution.canonical_slug !== slug) {
    redirect(`/${locale}/${resolution.canonical_slug}`);
  }

  // Render appropriate content based on entity type
  switch (resolution.entity_type) {
    case "profile":
      return <ProfileContent profileId={resolution.entity_id} locale={locale} />;

    case "organizer":
      return (
        <main className="min-h-screen">
          <OrganizerContent organizerId={resolution.entity_id} locale={locale} />
        </main>
      );

    case "venue":
      return (
        <main className="min-h-screen pb-8">
          <VenueContent venueId={resolution.entity_id} locale={locale} />
        </main>
      );

    default:
      notFound();
  }
}
