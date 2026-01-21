/**
 * Backfill coordinates for existing events
 * Extracts latitude/longitude from google_maps_url field
 *
 * Usage:
 *   npx tsx scripts/backfill-coordinates.ts --dry-run  # Preview changes
 *   npx tsx scripts/backfill-coordinates.ts            # Apply changes
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Vietnam bounds for validation
const VIETNAM_BOUNDS = {
    minLat: 8.0,
    maxLat: 24.0,
    minLng: 102.0,
    maxLng: 110.0,
};

function isWithinVietnam(lat: number, lng: number): boolean {
    return (
        lat >= VIETNAM_BOUNDS.minLat &&
        lat <= VIETNAM_BOUNDS.maxLat &&
        lng >= VIETNAM_BOUNDS.minLng &&
        lng <= VIETNAM_BOUNDS.maxLng
    );
}

/**
 * Extract coordinates from various Google Maps URL formats
 */
function extractCoordsFromUrl(url: string): { lat: number; lng: number } | null {
    if (!url) return null;

    // Format 1: @lat,lng,zoom (most common)
    // Example: https://www.google.com/maps/place/.../@11.9404,108.4583,17z/...
    const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lng = parseFloat(atMatch[2]);
        if (isWithinVietnam(lat, lng)) {
            return { lat, lng };
        }
    }

    // Format 2: ?q=lat,lng
    // Example: https://www.google.com/maps?q=11.9404,108.4583
    const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (qMatch) {
        const lat = parseFloat(qMatch[1]);
        const lng = parseFloat(qMatch[2]);
        if (isWithinVietnam(lat, lng)) {
            return { lat, lng };
        }
    }

    // Format 3: /search/lat,lng or /place/lat,lng
    const searchMatch = url.match(/\/(search|place)\/(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (searchMatch) {
        const lat = parseFloat(searchMatch[2]);
        const lng = parseFloat(searchMatch[3]);
        if (isWithinVietnam(lat, lng)) {
            return { lat, lng };
        }
    }

    // Format 4: ll=lat,lng
    const llMatch = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (llMatch) {
        const lat = parseFloat(llMatch[1]);
        const lng = parseFloat(llMatch[2]);
        if (isWithinVietnam(lat, lng)) {
            return { lat, lng };
        }
    }

    // Format 5: !3d{lat}!4d{lng} (Google Maps embed format)
    const embedMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
    if (embedMatch) {
        const lat = parseFloat(embedMatch[1]);
        const lng = parseFloat(embedMatch[2]);
        if (isWithinVietnam(lat, lng)) {
            return { lat, lng };
        }
    }

    return null;
}

async function main() {
    const isDryRun = process.argv.includes("--dry-run");

    console.log(`\n🗺️  Backfill Coordinates Script`);
    console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "APPLY CHANGES"}\n`);

    // Fetch events without coordinates but with google_maps_url
    const { data: events, error } = await supabase
        .from("events")
        .select("id, title, google_maps_url, latitude, longitude")
        .not("google_maps_url", "is", null)
        .or("latitude.is.null,longitude.is.null");

    if (error) {
        console.error("Error fetching events:", error);
        process.exit(1);
    }

    console.log(`Found ${events?.length || 0} events with Google Maps URL but missing coordinates\n`);

    if (!events || events.length === 0) {
        console.log("No events to process.");
        return;
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events) {
        const coords = extractCoordsFromUrl(event.google_maps_url);

        if (!coords) {
            console.log(`⚠️  Could not extract coords: ${event.title}`);
            console.log(`   URL: ${event.google_maps_url}`);
            skipped++;
            continue;
        }

        console.log(`✅ ${event.title}`);
        console.log(`   Coords: ${coords.lat}, ${coords.lng}`);

        if (!isDryRun) {
            const { error: updateError } = await supabase
                .from("events")
                .update({ latitude: coords.lat, longitude: coords.lng })
                .eq("id", event.id);

            if (updateError) {
                console.log(`   ❌ Failed to update: ${updateError.message}`);
                failed++;
            } else {
                updated++;
            }
        } else {
            updated++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Failed: ${failed}`);

    if (isDryRun) {
        console.log(`\n💡 Run without --dry-run to apply changes`);
    }
}

main().catch(console.error);
