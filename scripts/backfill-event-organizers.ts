/**
 * Backfill existing events with organizer_id and smart map URLs
 *
 * Usage:
 *   bun run scripts/backfill-event-organizers.ts [--dry-run]
 *
 * This script:
 * 1. Finds events imported from Facebook (have external_chat_url with facebook.com)
 * 2. Matches them to organizers based on the ghost profile's display_name
 * 3. Updates organizer_id if missing
 * 4. Generates smart map URLs if google_maps_url is missing
 */

import { createClient } from "@supabase/supabase-js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

function generateMapsSearchUrl(locationName?: string | null): string | null {
  if (!locationName) return null;
  const searchQuery = [locationName, "Vietnam"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     Backfill Event Organizers & Map URLs                       ║
╠════════════════════════════════════════════════════════════════╣
║  Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will update database)"}
╚════════════════════════════════════════════════════════════════╝
`);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all events that might need backfilling
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, location_name, google_maps_url, organizer_id, created_by, external_chat_url, profiles(display_name)")
    .or("organizer_id.is.null,google_maps_url.is.null")
    .order("created_at", { ascending: false });

  if (eventsError) {
    console.error("❌ Failed to fetch events:", eventsError.message);
    process.exit(1);
  }

  console.log(`Found ${events?.length ?? 0} events that may need backfilling\n`);

  if (!events || events.length === 0) {
    console.log("✅ Nothing to backfill!");
    process.exit(0);
  }

  // Get all organizers for matching
  const { data: organizers } = await supabase
    .from("organizers")
    .select("id, slug, name");

  const organizerByName = new Map<string, string>();
  const organizerBySlug = new Map<string, string>();

  for (const org of organizers || []) {
    organizerByName.set(org.name.toLowerCase(), org.id);
    organizerBySlug.set(org.slug, org.id);
  }

  let updatedOrganizers = 0;
  let updatedMaps = 0;
  let skipped = 0;
  let errors = 0;

  for (const event of events) {
    const updates: Record<string, any> = {};
    const reasons: string[] = [];

    // Check if we need to set organizer_id
    // profiles is returned as a single object due to created_by FK, but TS infers array
    const profile = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
    if (!event.organizer_id && profile?.display_name) {
      const displayName = profile.display_name as string;
      const slug = slugify(displayName);

      // Try to match by name or slug
      const matchedOrgId = organizerByName.get(displayName.toLowerCase()) || organizerBySlug.get(slug);

      if (matchedOrgId) {
        updates.organizer_id = matchedOrgId;
        reasons.push(`organizer: ${displayName}`);
        updatedOrganizers++;
      }
    }

    // Check if we need to generate map URL
    if (!event.google_maps_url && event.location_name) {
      const mapUrl = generateMapsSearchUrl(event.location_name);
      if (mapUrl) {
        updates.google_maps_url = mapUrl;
        reasons.push(`map: ${event.location_name.substring(0, 30)}...`);
        updatedMaps++;
      }
    }

    if (Object.keys(updates).length === 0) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`⏩ Would update "${event.title?.substring(0, 40)}..."`);
      console.log(`   ${reasons.join(", ")}`);
    } else {
      const { error: updateError } = await supabase
        .from("events")
        .update(updates)
        .eq("id", event.id);

      if (updateError) {
        console.error(`❌ Failed to update "${event.title?.substring(0, 40)}...":`, updateError.message);
        errors++;
      } else {
        console.log(`✓ Updated "${event.title?.substring(0, 40)}..."`);
        console.log(`   ${reasons.join(", ")}`);
      }
    }
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Backfill Summary                            ║
╠════════════════════════════════════════════════════════════════╣
║  Events processed: ${events.length.toString().padEnd(41)}
║  Organizers linked: ${updatedOrganizers.toString().padEnd(40)}
║  Map URLs generated: ${updatedMaps.toString().padEnd(39)}
║  Skipped (nothing to update): ${skipped.toString().padEnd(29)}
║  Errors: ${errors.toString().padEnd(52)}
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to apply changes.\n");
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
