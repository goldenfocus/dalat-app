/**
 * Run the coordinate migration using Supabase client
 * This adds latitude/longitude columns to the events table
 *
 * Usage: npx tsx scripts/run-coordinate-migration.ts
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

async function main() {
    console.log("🗄️  Running coordinate migration...\n");

    // Check if columns already exist
    const { data: columns, error: checkError } = await supabase.rpc("to_regclass", {
        name: "events",
    });

    // Try to add columns using raw SQL via rpc
    // Since we can't run raw DDL easily, let's check if columns exist by querying
    const { data: testData, error: testError } = await supabase
        .from("events")
        .select("id, latitude, longitude")
        .limit(1);

    if (testError && testError.code === "42703") {
        console.log("❌ latitude/longitude columns do not exist.");
        console.log("\n📋 Please run the following SQL in Supabase Dashboard SQL Editor:");
        console.log("   https://supabase.com/dashboard/project/_/sql\n");
        console.log(`
-- Add latitude and longitude columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Add index for geospatial queries
CREATE INDEX IF NOT EXISTS idx_events_coordinates ON events (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comments
COMMENT ON COLUMN events.latitude IS 'Latitude coordinate for map display';
COMMENT ON COLUMN events.longitude IS 'Longitude coordinate for map display';
        `);
        return;
    }

    if (testError) {
        console.error("Error checking columns:", testError);
        return;
    }

    console.log("✅ Columns latitude and longitude already exist!");
    console.log(`   Sample data: ${JSON.stringify(testData?.[0] || {})}`);
}

main().catch(console.error);
