/**
 * Backfill SEO Keywords for Playlist Tracks
 *
 * This script:
 * 1. Fetches playlist tracks that have lyrics_lrc but no seo_keywords
 * 2. Uses Claude to extract SEO keywords from the transcript
 * 3. Updates the database with the extracted keywords
 *
 * Usage:
 *   npx tsx scripts/backfill-seo-keywords.ts
 *
 * Options:
 *   --dry-run    Preview what would be processed without making changes
 *   --limit=N    Process only N items (for testing)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { extractSeoKeywords } from "../lib/ai/seo-keyword-extractor";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY - required for Claude");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

/**
 * Extract text from LRC format
 */
function extractTextFromLrc(lrc: string): string {
  const lines = lrc.split("\n");
  const textLines: string[] = [];

  for (const line of lines) {
    // Remove timestamp and get text
    const match = line.match(/^\[\d{1,2}:\d{2}[.:]\d{2,3}\](.*)$/);
    if (match && match[1].trim()) {
      textLines.push(match[1].trim());
    }
  }

  return textLines.join(" ");
}

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║     Backfill SEO Keywords for Karaoke          ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit} items`);
  console.log("");

  // Fetch tracks that need SEO keywords
  let query = supabase
    .from("playlist_tracks")
    .select("id, title, artist, lyrics_lrc, seo_keywords")
    .not("lyrics_lrc", "is", null)
    .is("seo_keywords", null);

  if (limit) {
    query = query.limit(limit);
  }

  const { data: tracks, error } = await query;

  if (error) {
    console.error("Error fetching tracks:", error);
    process.exit(1);
  }

  console.log(`Found ${tracks?.length || 0} tracks needing SEO keywords\n`);

  let processed = 0;
  let failed = 0;

  for (const track of tracks || []) {
    console.log(`\n[${processed + failed + 1}] Processing: ${track.title || "Untitled"}`);
    console.log(`  Artist: ${track.artist || "Unknown"}`);

    if (dryRun) {
      console.log("  [DRY RUN] Would extract SEO keywords");
      processed++;
      continue;
    }

    try {
      // Extract text from LRC
      const transcript = extractTextFromLrc(track.lyrics_lrc);
      console.log(`  Transcript length: ${transcript.length} chars`);

      // Extract SEO keywords using Claude
      const keywords = await extractSeoKeywords({
        title: track.title || "Unknown",
        artist: track.artist || "Unknown",
        transcript,
      });

      console.log(`  Themes: ${keywords.themes.join(", ")}`);
      console.log(`  Genres: ${keywords.genres.join(", ")}`);
      console.log(`  Moods: ${keywords.moods.join(", ")}`);

      // Update database
      const { error: updateError } = await supabase
        .from("playlist_tracks")
        .update({ seo_keywords: keywords })
        .eq("id", track.id);

      if (updateError) {
        console.error("  [FAILED] Error updating:", updateError);
        failed++;
      } else {
        console.log("  [SUCCESS] Updated SEO keywords");
        processed++;
      }

      // Rate limiting - wait between requests
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error("  [FAILED] Error extracting keywords:", error);
      failed++;
    }
  }

  // Summary
  console.log("\n════════════════════════════════════════════════");
  console.log("                    SUMMARY                      ");
  console.log("════════════════════════════════════════════════");
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${processed + failed}`);
}

main().catch(console.error);
