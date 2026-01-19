/**
 * Import Facebook Events from Apify scraper output
 *
 * Usage:
 *   bun run scripts/import-facebook-events.ts [--dry-run] [--file=path] [--limit=N]
 *
 * Before running:
 *   1. Sign up at apify.com
 *   2. Run Facebook Events Scraper with query "Đà Lạt"
 *   3. Export results to scripts/data/facebook-events.json
 *
 * Environment:
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key (admin access)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// =============================================================================
// Types for Apify Facebook Events Scraper output (flat structure)
// =============================================================================

interface ApifyEvent {
  url: string;
  name: string;
  description?: string;
  utcStartDate?: string;
  utcEndDate?: string;
  duration?: string | null;
  // Flat location fields
  "location.name"?: string;
  "location.address"?: string;
  "location.city"?: string;
  "location.countryCode"?: string;
  "location.latitude"?: number;
  "location.longitude"?: number;
  // Organizer as string like "Event by Phố Bên Đồi"
  organizedBy?: string;
  usersGoing?: number;
  usersInterested?: number;
  imageUrl?: string;
  imageCaption?: string;
  ticketUrl?: string;
  isPastEvent?: boolean;
}

// Helper to extract organizer name from "Event by XYZ" string
function extractOrganizerName(organizedBy?: string): string {
  if (!organizedBy) return "Unknown Organizer";
  // Remove "Event by " prefix and handle multiple organizers (joined by " and ")
  return organizedBy.replace(/^Event by\s*/i, "").split(" and ")[0].trim();
}

// =============================================================================
// Utility functions
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Spaces to hyphens
    .replace(/-+/g, "-") // Multiple hyphens to single
    .replace(/^-|-$/g, "") // Trim hyphens
    .substring(0, 60); // Limit length
}

function generateGoogleMapsUrl(lat?: number, lng?: number): string | null {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Extract Google Maps URL from description text
 * Handles various formats: maps.app.goo.gl, goo.gl/maps, google.com/maps
 */
function extractGoogleMapsFromDescription(description?: string): string | null {
  if (!description) return null;

  // Match various Google Maps URL formats
  const patterns = [
    /https?:\/\/maps\.app\.goo\.gl\/[\w-]+/gi,
    /https?:\/\/goo\.gl\/maps\/[\w-]+/gi,
    /https?:\/\/(?:www\.)?google\.com\/maps[^\s)"]*/gi,
    /https?:\/\/maps\.google\.com[^\s)"]*/gi,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0];
  }

  return null;
}

/**
 * Generate a Google Maps search URL from location name
 * This doesn't require API keys - just opens a search
 */
function generateMapsSearchUrl(locationName?: string, city?: string): string | null {
  if (!locationName && !city) return null;

  const searchQuery = [locationName, city, "Vietnam"]
    .filter(Boolean)
    .join(", ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
}

/**
 * Smart map URL resolution with fallback chain:
 * 1. Exact coordinates (most accurate)
 * 2. Extracted from description text
 * 3. Generated search URL from location name
 */
function resolveMapUrl(
  lat?: number,
  lng?: number,
  description?: string,
  locationName?: string,
  city?: string
): string | null {
  // Priority 1: Exact coordinates
  const coordUrl = generateGoogleMapsUrl(lat, lng);
  if (coordUrl) return coordUrl;

  // Priority 2: Extract from description
  const extractedUrl = extractGoogleMapsFromDescription(description);
  if (extractedUrl) return extractedUrl;

  // Priority 3: Generate search URL
  return generateMapsSearchUrl(locationName, city);
}

function extractFacebookEventId(url: string): string | null {
  const match = url.match(/events\/(\d+)/);
  return match ? match[1] : null;
}

async function generateUniqueSlug(
  supabase: any,
  baseSlug: string
): Promise<string> {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("events")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (!data) return slug;

    slug = `${baseSlug}-${counter}`;
    counter++;

    if (counter > 100) {
      // Fallback: add random suffix
      slug = `${baseSlug}-${Date.now()}`;
      return slug;
    }
  }
}

async function generateUniqueUsername(
  supabase: any,
  baseName: string
): Promise<string> {
  const baseUsername = slugify(baseName).substring(0, 20) || "organizer";
  let username = baseUsername;
  let counter = 1;

  while (true) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .single();

    if (!data) return username;

    username = `${baseUsername}${counter}`;
    counter++;

    if (counter > 100) {
      username = `${baseUsername}-${Date.now()}`;
      return username;
    }
  }
}

// =============================================================================
// Main import logic
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((a) => a.startsWith("--file="));
  const limitArg = args.find((a) => a.startsWith("--limit="));

  const filePath = fileArg?.split("=")[1] || "scripts/data/facebook-events.json";
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Facebook Events Import Script                          ║
╠════════════════════════════════════════════════════════════════╣
║  Mode: ${dryRun ? "DRY RUN (no database changes)" : "LIVE (will modify database)"}
║  File: ${filePath}
║  Limit: ${limit === Infinity ? "none" : limit}
╚════════════════════════════════════════════════════════════════╝
`);

  // Check environment
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("   Set these in your .env.local file");
    process.exit(1);
  }

  // Check input file
  const fullPath = join(process.cwd(), filePath);
  if (!existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    console.error(`
   To get this file:
   1. Go to https://apify.com/apify/facebook-events-scraper
   2. Run with input: { "searchQuery": "Đà Lạt", "maxEvents": 500 }
   3. Export results as JSON to ${filePath}
`);
    process.exit(1);
  }

  // Parse JSON
  let events: ApifyEvent[];
  try {
    const raw = readFileSync(fullPath, "utf-8");
    events = JSON.parse(raw);
    console.log(`📁 Loaded ${events.length} events from file\n`);
  } catch (err) {
    console.error("❌ Failed to parse JSON:", err);
    process.exit(1);
  }

  // Filter to Vietnam events only (avoid false positives like "Latina" Italy or "dawnych lat" Poland)
  const vietnamEvents = events.filter(
    (e) => e["location.countryCode"] === "VN" || !e["location.countryCode"]
  );

  if (vietnamEvents.length < events.length) {
    console.log(`🇻🇳 Filtered to Vietnam events: ${vietnamEvents.length} of ${events.length}\n`);
    events = vietnamEvents;
  }

  // Apply limit
  if (limit < events.length) {
    events = events.slice(0, limit);
    console.log(`📊 Limited to ${limit} events\n`);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ==========================================================================
  // Phase 1: Extract and dedupe organizers
  // ==========================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 1: Processing Organizers");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Group events by organizer
  const organizerMap = new Map<string, { organizerName: string; eventCount: number }>();
  const unknownOrganizerKey = "__UNKNOWN__";

  for (const event of events) {
    const organizerName = extractOrganizerName(event.organizedBy);
    const orgKey = organizerName || unknownOrganizerKey;
    const existing = organizerMap.get(orgKey);

    if (existing) {
      existing.eventCount++;
    } else {
      organizerMap.set(orgKey, {
        organizerName,
        eventCount: 1,
      });
    }
  }

  console.log(`Found ${organizerMap.size} unique organizers:\n`);

  // Sort by event count descending
  const sortedOrganizers = Array.from(organizerMap.entries()).sort(
    (a, b) => b[1].eventCount - a[1].eventCount
  );

  for (const [key, { organizerName, eventCount }] of sortedOrganizers.slice(0, 10)) {
    console.log(`  • ${organizerName || key} (${eventCount} events)`);
  }
  if (sortedOrganizers.length > 10) {
    console.log(`  ... and ${sortedOrganizers.length - 10} more\n`);
  }

  // Create organizers in the organizers table AND ghost auth users (claimable later)
  const organizerToProfileId = new Map<string, string>();
  const organizerToOrganizerId = new Map<string, string>();

  if (!dryRun) {
    console.log("\nCreating organizers and ghost accounts (claimable later)...\n");

    for (const [key, { organizerName }] of sortedOrganizers) {
      if (key === unknownOrganizerKey) continue;

      const displayName = organizerName || `Organizer ${key.substring(0, 8)}`;
      const username = await generateUniqueUsername(supabase, displayName);
      const organizerSlug = slugify(displayName);

      // First, check if organizer already exists (by slug or name)
      const { data: existingOrg } = await supabase
        .from("organizers")
        .select("id, slug")
        .or(`slug.eq.${organizerSlug},name.eq.${displayName}`)
        .single();

      let organizerId: string;

      if (existingOrg) {
        // Organizer already exists, reuse it
        organizerId = existingOrg.id;
        console.log(`  ♻️ Reusing existing organizer: ${displayName}`);
      } else {
        // Create new organizer entry in organizers table
        const { data: newOrg, error: orgError } = await supabase
          .from("organizers")
          .insert({
            slug: organizerSlug,
            name: displayName,
            description: `Organizer imported from Facebook Events. Contact us to claim this profile!`,
          })
          .select("id")
          .single();

        if (orgError) {
          console.error(`  ❌ Failed to create organizer for ${displayName}:`, orgError.message);
          continue;
        }

        organizerId = newOrg.id;
        console.log(`  ✓ Created organizer: ${displayName} (/${organizerSlug})`);
      }

      organizerToOrganizerId.set(key, organizerId);

      // Also create ghost auth user (for backwards compatibility and ownership claims)
      const placeholderEmail = `${username}@placeholder.dalat.app`;

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: false,
        user_metadata: {
          display_name: displayName,
          is_ghost: true,
          original_organizer: organizerName,
        },
      });

      if (authError) {
        // Ghost user creation failed, but organizer was created - continue
        console.warn(`  ⚠️ Organizer created but ghost user failed for ${displayName}:`, authError.message);
        continue;
      }

      const userId = authData.user.id;

      // Update the profile with proper details
      await supabase
        .from("profiles")
        .update({
          username,
          display_name: displayName,
          role: "organizer_pending",
          bio: "This profile was auto-created from Facebook Events. Are you the organizer? Contact us to claim it!",
          locale: "vi",
        })
        .eq("id", userId);

      organizerToProfileId.set(key, userId);

      // Link ghost profile to organizer (for future claiming)
      await supabase
        .from("organizers")
        .update({ owner_id: userId })
        .eq("id", organizerId);
    }

    // Create a fallback organizer for unknown events
    const fallbackSlug = "dalat-events-community";
    const { data: existingFallback } = await supabase
      .from("organizers")
      .select("id")
      .eq("slug", fallbackSlug)
      .single();

    let fallbackOrganizerId: string | undefined;

    if (existingFallback) {
      fallbackOrganizerId = existingFallback.id;
    } else {
      const { data: newFallback } = await supabase
        .from("organizers")
        .insert({
          slug: fallbackSlug,
          name: "Đà Lạt Events",
          description: "Events discovered in Đà Lạt. Want to claim an event? Contact us!",
        })
        .select("id")
        .single();

      if (newFallback) {
        fallbackOrganizerId = newFallback.id;
        console.log(`  ✓ Created fallback organizer: Đà Lạt Events\n`);
      }
    }

    if (fallbackOrganizerId) {
      organizerToOrganizerId.set(unknownOrganizerKey, fallbackOrganizerId);
    }

    // Create fallback ghost user
    const fallbackUsername = await generateUniqueUsername(supabase, "dalat-events");
    const fallbackEmail = `${fallbackUsername}@placeholder.dalat.app`;

    const { data: fallbackAuth, error: fallbackAuthError } = await supabase.auth.admin.createUser({
      email: fallbackEmail,
      email_confirm: false,
      user_metadata: {
        display_name: "Đà Lạt Events",
        is_ghost: true,
        is_fallback: true,
      },
    });

    if (!fallbackAuthError && fallbackAuth.user) {
      await supabase
        .from("profiles")
        .update({
          username: fallbackUsername,
          display_name: "Đà Lạt Events",
          role: "organizer_pending",
          bio: "Events discovered in Đà Lạt. Want to claim an event? Contact us!",
          locale: "vi",
        })
        .eq("id", fallbackAuth.user.id);

      organizerToProfileId.set(unknownOrganizerKey, fallbackAuth.user.id);
    }
  } else {
    console.log("\n⏩ DRY RUN: Skipping organizer/profile creation\n");
  }

  // ==========================================================================
  // Phase 2: Import events
  // ==========================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("PHASE 2: Importing Events");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const progress = `[${i + 1}/${events.length}]`;

    // Skip events without essential data
    if (!event.name || !event.utcStartDate) {
      console.log(`${progress} ⏩ Skipping (missing title or date): ${event.url}`);
      skipped++;
      continue;
    }

    // Check for duplicates by Facebook URL
    if (!dryRun) {
      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("external_chat_url", event.url)
        .single();

      if (existing) {
        console.log(`${progress} ⏩ Duplicate: ${event.name.substring(0, 40)}...`);
        skipped++;
        continue;
      }
    }

    // Prepare event data
    const baseSlug = slugify(event.name);
    const slug = dryRun ? baseSlug : await generateUniqueSlug(supabase, baseSlug);

    const organizerName = extractOrganizerName(event.organizedBy);
    const orgKey = organizerName || unknownOrganizerKey;
    const createdBy = organizerToProfileId.get(orgKey) || organizerToProfileId.get(unknownOrganizerKey);
    const organizerId = organizerToOrganizerId.get(orgKey) || organizerToOrganizerId.get(unknownOrganizerKey);

    // Build location string from flat fields
    const locationName = event["location.name"] || null;
    const locationCity = event["location.city"] || null;
    const fullLocation = locationName || locationCity || null;

    // Smart map URL resolution with fallback chain
    const googleMapsUrl = resolveMapUrl(
      event["location.latitude"],
      event["location.longitude"],
      event.description,
      locationName || undefined,
      locationCity || undefined
    );

    const eventData = {
      slug,
      title: event.name,
      description: event.description || null,
      starts_at: event.utcStartDate,
      ends_at: event.utcEndDate || null,
      location_name: fullLocation,
      address: event["location.address"] || null,
      google_maps_url: googleMapsUrl,
      external_chat_url: event.url,
      image_url: event.imageUrl || null,
      status: "published",
      timezone: "Asia/Ho_Chi_Minh",
      created_by: createdBy,
      organizer_id: organizerId || null,
    };

    if (dryRun) {
      console.log(`${progress} ⏩ Would import: ${event.name.substring(0, 50)}...`);
      console.log(`        Slug: ${slug}`);
      console.log(`        Date: ${event.utcStartDate}`);
      console.log(`        Location: ${fullLocation || "N/A"}`);
      console.log(`        Organizer: ${organizerName}`);
      imported++;
    } else {
      const { error: insertError } = await supabase.from("events").insert(eventData);

      if (insertError) {
        console.error(`${progress} ❌ Failed: ${event.name.substring(0, 40)}...`);
        console.error(`        ${insertError.message}`);
        errors++;
      } else {
        console.log(`${progress} ✓ Imported: ${event.name.substring(0, 50)}...`);
        imported++;
      }
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                       Import Summary                           ║
╠════════════════════════════════════════════════════════════════╣
║  Events processed: ${events.length.toString().padEnd(42)}
║  Successfully imported: ${imported.toString().padEnd(37)}
║  Skipped (duplicates/missing data): ${skipped.toString().padEnd(25)}
║  Errors: ${errors.toString().padEnd(53)}
║  Organizers created: ${organizerToOrganizerId.size.toString().padEnd(40)}
║  Ghost profiles created: ${organizerToProfileId.size.toString().padEnd(36)}
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to actually import.\n");
  } else if (imported > 0) {
    console.log(`
💡 Next steps:
   1. Check the events on your site
   2. Run translation backfill:
      bun run scripts/backfill-translations.ts --type=event --limit=${imported}
`);
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
