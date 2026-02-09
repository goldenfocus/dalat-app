/**
 * Review & fix LRC lyrics using Claude AI
 *
 * Whisper often hallucinates on AI-generated or mixed-language audio,
 * producing nonsense like "subscribe to Ghiền Mì Gõ" or "Baguio Botanical Garden."
 * This script sends each track's lyrics to Claude for review — it removes
 * hallucinated lines, fixes garbled text, and preserves timestamps.
 *
 * Usage:
 *   npx tsx scripts/review-lyrics.ts
 *
 * Options:
 *   --dry-run     Preview changes without updating the database
 *   --limit=N     Process only N tracks
 *   --type=TYPE   Process only 'moments', 'materials', or 'playlist'
 *   --verbose     Show full before/after LRC diff
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!anthropicApiKey) {
  console.error("Missing ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const claude = new Anthropic({ apiKey: anthropicApiKey });

// Parse CLI arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
const typeArg = args.find((a) => a.startsWith("--type="));
const typeFilter = typeArg ? typeArg.split("=")[1] : undefined;

interface LrcReviewResult {
  cleanedLrc: string;
  removedLines: string[];
  fixedLines: { original: string; fixed: string }[];
  verdict: "clean" | "fixed" | "mostly_hallucinated";
}

/**
 * Extract plain text lines from LRC, preserving timestamps.
 */
function parseLrcLines(lrc: string): { timestamp: string; text: string }[] {
  const result: { timestamp: string; text: string }[] = [];
  for (const line of lrc.split("\n")) {
    const match = line.match(/^(\[\d{2}:\d{2}\.\d{2,3}\])(.*)$/);
    if (match) {
      result.push({ timestamp: match[1], text: match[2].trim() });
    }
  }
  return result;
}

/**
 * Extract metadata lines from LRC (e.g., [la:vi], [ti:Song Title]).
 */
function extractMetadata(lrc: string): string[] {
  const metadata: string[] = [];
  for (const line of lrc.split("\n")) {
    if (line.match(/^\[[a-z]+:.+\]$/i)) {
      metadata.push(line);
    }
  }
  return metadata;
}

/**
 * Send lyrics to Claude for hallucination review.
 */
async function reviewWithClaude(
  lyrics: string,
  title: string,
  artist: string
): Promise<LrcReviewResult> {
  const lines = parseLrcLines(lyrics);
  const metadata = extractMetadata(lyrics);

  if (lines.length === 0) {
    return { cleanedLrc: lyrics, removedLines: [], fixedLines: [], verdict: "clean" };
  }

  // Build numbered list of lines for Claude to review
  const numberedLines = lines
    .map((l, i) => `${i + 1}. ${l.text}`)
    .join("\n");

  const response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: `You are a lyrics quality reviewer. You identify lines that are Whisper transcription hallucinations — text that is NOT actual song lyrics but was fabricated by the speech-to-text model.

Common hallucination patterns:
- YouTube channel promotions ("subscribe", "like and share", channel names)
- Tour guide narration ("to your left/right is the...")
- Website URLs or attribution lines
- Repetitive nonsensical text that doesn't fit the song
- Text in a completely different language/context than the song
- Generic filler phrases repeated many times

Songs from this app are typically Vietnamese, English, or mixed Vietnamese/English music about Dalat, Vietnam.

Respond ONLY with valid JSON, no markdown fences.`,
    messages: [
      {
        role: "user",
        content: `Review these lyrics from "${title || "Unknown"}" by "${artist || "Unknown"}".

Mark each line as "keep", "remove" (hallucination), or "fix" (garbled but real lyrics).
For "fix" lines, provide the corrected text.

Lines:
${numberedLines}

Respond as JSON:
{
  "lines": [
    { "num": 1, "action": "keep" },
    { "num": 2, "action": "remove", "reason": "YouTube channel promo" },
    { "num": 3, "action": "fix", "fixed": "corrected text here", "reason": "garbled Vietnamese" }
  ]
}`,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text response from Claude");
  }

  // Parse Claude's response — strip markdown fences if present
  let review: { lines: { num: number; action: string; fixed?: string; reason?: string }[] };
  try {
    let jsonStr = textContent.text.trim();
    // Strip ```json ... ``` fences
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }
    review = JSON.parse(jsonStr);
  } catch {
    console.error("  Failed to parse Claude response:", textContent.text.slice(0, 200));
    return { cleanedLrc: lyrics, removedLines: [], fixedLines: [], verdict: "clean" };
  }

  // Rebuild LRC with fixes applied
  const cleanedLines: string[] = [];
  const removedLines: string[] = [];
  const fixedLines: { original: string; fixed: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineReview = review.lines.find((r) => r.num === i + 1);
    const action = lineReview?.action || "keep";

    if (action === "remove") {
      removedLines.push(`${lines[i].text} (${lineReview?.reason || "hallucination"})`);
    } else if (action === "fix" && lineReview?.fixed) {
      fixedLines.push({ original: lines[i].text, fixed: lineReview.fixed });
      cleanedLines.push(`${lines[i].timestamp}${lineReview.fixed}`);
    } else {
      cleanedLines.push(`${lines[i].timestamp}${lines[i].text}`);
    }
  }

  // Determine verdict
  const removedRatio = removedLines.length / lines.length;
  let verdict: LrcReviewResult["verdict"] = "clean";
  if (removedRatio > 0.5) {
    verdict = "mostly_hallucinated";
  } else if (removedLines.length > 0 || fixedLines.length > 0) {
    verdict = "fixed";
  }

  // Reconstruct full LRC with metadata
  const fullLrc = [...metadata, "", ...cleanedLines].join("\n");

  return { cleanedLrc: fullLrc, removedLines, fixedLines, verdict };
}

// ============================================
// Process each content type
// ============================================

interface Stats {
  processed: number;
  skipped: number;
  fixed: number;
  hallucinated: number;
  failed: number;
}

function emptyStats(): Stats {
  return { processed: 0, skipped: 0, fixed: 0, hallucinated: 0, failed: 0 };
}

async function processPlaylistTracks(): Promise<Stats> {
  console.log("\n=== Reviewing Playlist Tracks ===\n");

  let query = supabase
    .from("playlist_tracks")
    .select("id, title, artist, lyrics_lrc")
    .not("lyrics_lrc", "is", null);

  if (limit) query = query.limit(limit);

  const { data: tracks, error } = await query;

  if (error) {
    console.error("Error fetching playlist tracks:", error);
    return emptyStats();
  }

  console.log(`Found ${tracks?.length || 0} tracks with lyrics to review`);
  const stats = emptyStats();

  for (const track of tracks || []) {
    stats.processed++;
    console.log(`\n[${stats.processed}] ${track.title || "Untitled"} — ${track.artist || "Unknown"}`);

    try {
      const result = await reviewWithClaude(
        track.lyrics_lrc,
        track.title || "",
        track.artist || ""
      );

      if (result.verdict === "clean") {
        console.log("  ✓ Clean — no hallucinations detected");
        stats.skipped++;
        continue;
      }

      // Log changes
      if (result.removedLines.length > 0) {
        console.log(`  ✗ Removed ${result.removedLines.length} hallucinated lines:`);
        for (const line of result.removedLines) {
          console.log(`    - ${line}`);
        }
      }
      if (result.fixedLines.length > 0) {
        console.log(`  ~ Fixed ${result.fixedLines.length} lines:`);
        for (const fix of result.fixedLines) {
          console.log(`    "${fix.original}" → "${fix.fixed}"`);
        }
      }

      if (result.verdict === "mostly_hallucinated") {
        console.log("  ⚠ MOSTLY HALLUCINATED — over half the lyrics are fake. Clearing lyrics.");
        stats.hallucinated++;

        if (!dryRun) {
          await supabase
            .from("playlist_tracks")
            .update({ lyrics_lrc: null })
            .eq("id", track.id);
        }
        continue;
      }

      stats.fixed++;

      if (verbose) {
        console.log("\n  --- Cleaned LRC ---");
        console.log(result.cleanedLrc);
        console.log("  -------------------");
      }

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("playlist_tracks")
          .update({ lyrics_lrc: result.cleanedLrc })
          .eq("id", track.id);

        if (updateError) {
          console.error("  [FAILED] Error updating track:", updateError);
          stats.failed++;
        } else {
          console.log("  [SAVED] Updated lyrics");
        }
      } else {
        console.log("  [DRY RUN] Would update lyrics");
      }
    } catch (err) {
      console.error("  [FAILED] Error reviewing track:", err);
      stats.failed++;
    }

    // Rate limiting — Claude Haiku is fast but be polite
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return stats;
}

async function processAudioMoments(): Promise<Stats> {
  console.log("\n=== Reviewing Audio Moments ===\n");

  let query = supabase
    .from("moments")
    .select("id, title, artist, moment_metadata!left(lyrics_lrc)")
    .eq("content_type", "audio")
    .eq("status", "published");

  if (limit) query = query.limit(limit);

  const { data: moments, error } = await query;

  if (error) {
    console.error("Error fetching moments:", error);
    return emptyStats();
  }

  const getMeta = (m: (typeof moments extends (infer T)[] | null ? T : never)) => {
    const raw = m.moment_metadata;
    return (Array.isArray(raw) ? raw[0] : raw) as { lyrics_lrc: string | null } | undefined;
  };

  const withLyrics = (moments || []).filter((m) => getMeta(m)?.lyrics_lrc);

  console.log(`Found ${withLyrics.length} audio moments with lyrics to review`);
  const stats = emptyStats();

  for (const moment of withLyrics) {
    const meta = getMeta(moment);
    stats.processed++;
    console.log(`\n[${stats.processed}] ${moment.title || "Untitled"} — ${moment.artist || "Unknown"}`);

    try {
      const result = await reviewWithClaude(
        meta!.lyrics_lrc!,
        moment.title || "",
        moment.artist || ""
      );

      if (result.verdict === "clean") {
        console.log("  ✓ Clean");
        stats.skipped++;
        continue;
      }

      if (result.removedLines.length > 0) {
        console.log(`  ✗ Removed ${result.removedLines.length} hallucinated lines:`);
        for (const line of result.removedLines) {
          console.log(`    - ${line}`);
        }
      }
      if (result.fixedLines.length > 0) {
        console.log(`  ~ Fixed ${result.fixedLines.length} lines:`);
        for (const fix of result.fixedLines) {
          console.log(`    "${fix.original}" → "${fix.fixed}"`);
        }
      }

      if (result.verdict === "mostly_hallucinated") {
        console.log("  ⚠ MOSTLY HALLUCINATED — clearing lyrics");
        stats.hallucinated++;
        if (!dryRun) {
          await supabase.rpc("upsert_moment_metadata", {
            p_moment_id: moment.id,
            p_lyrics_lrc: null,
          });
        }
        continue;
      }

      stats.fixed++;

      if (!dryRun) {
        const { error: updateError } = await supabase.rpc("upsert_moment_metadata", {
          p_moment_id: moment.id,
          p_lyrics_lrc: result.cleanedLrc,
        });

        if (updateError) {
          console.error("  [FAILED]", updateError);
          stats.failed++;
        } else {
          console.log("  [SAVED] Updated lyrics");
        }
      } else {
        console.log("  [DRY RUN] Would update lyrics");
      }
    } catch (err) {
      console.error("  [FAILED]", err);
      stats.failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return stats;
}

async function processEventMaterials(): Promise<Stats> {
  console.log("\n=== Reviewing Event Materials ===\n");

  let query = supabase
    .from("event_materials")
    .select("id, title, artist, lyrics_lrc")
    .eq("material_type", "audio")
    .not("lyrics_lrc", "is", null);

  if (limit) query = query.limit(limit);

  const { data: materials, error } = await query;

  if (error) {
    console.error("Error fetching materials:", error);
    return emptyStats();
  }

  console.log(`Found ${materials?.length || 0} materials with lyrics to review`);
  const stats = emptyStats();

  for (const material of materials || []) {
    stats.processed++;
    console.log(`\n[${stats.processed}] ${material.title || "Untitled"} — ${material.artist || "Unknown"}`);

    try {
      const result = await reviewWithClaude(
        material.lyrics_lrc,
        material.title || "",
        material.artist || ""
      );

      if (result.verdict === "clean") {
        console.log("  ✓ Clean");
        stats.skipped++;
        continue;
      }

      if (result.removedLines.length > 0) {
        console.log(`  ✗ Removed ${result.removedLines.length} hallucinated lines:`);
        for (const line of result.removedLines) {
          console.log(`    - ${line}`);
        }
      }
      if (result.fixedLines.length > 0) {
        console.log(`  ~ Fixed ${result.fixedLines.length} lines:`);
        for (const fix of result.fixedLines) {
          console.log(`    "${fix.original}" → "${fix.fixed}"`);
        }
      }

      if (result.verdict === "mostly_hallucinated") {
        console.log("  ⚠ MOSTLY HALLUCINATED — clearing lyrics");
        stats.hallucinated++;
        if (!dryRun) {
          await supabase
            .from("event_materials")
            .update({ lyrics_lrc: null })
            .eq("id", material.id);
        }
        continue;
      }

      stats.fixed++;

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from("event_materials")
          .update({ lyrics_lrc: result.cleanedLrc })
          .eq("id", material.id);

        if (updateError) {
          console.error("  [FAILED]", updateError);
          stats.failed++;
        } else {
          console.log("  [SAVED] Updated lyrics");
        }
      } else {
        console.log("  [DRY RUN] Would update lyrics");
      }
    } catch (err) {
      console.error("  [FAILED]", err);
      stats.failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return stats;
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════╗");
  console.log("║   Review & Fix Lyrics — AI Hallucination Cleanup   ║");
  console.log("╚═══════════════════════════════════════════════════╝");
  console.log("");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  if (limit) console.log(`Limit: ${limit} items`);
  if (typeFilter) console.log(`Type filter: ${typeFilter}`);
  if (verbose) console.log("Verbose: showing full LRC diffs");
  console.log("");

  let playlistStats = emptyStats();
  let momentsStats = emptyStats();
  let materialsStats = emptyStats();

  if (!typeFilter || typeFilter === "playlist") {
    playlistStats = await processPlaylistTracks();
  }
  if (!typeFilter || typeFilter === "moments") {
    momentsStats = await processAudioMoments();
  }
  if (!typeFilter || typeFilter === "materials") {
    materialsStats = await processEventMaterials();
  }

  // Summary
  const total = (s: Stats) => s.processed;
  const allStats = [playlistStats, momentsStats, materialsStats];
  const totalProcessed = allStats.reduce((n, s) => n + total(s), 0);
  const totalFixed = allStats.reduce((n, s) => n + s.fixed, 0);
  const totalHallucinated = allStats.reduce((n, s) => n + s.hallucinated, 0);
  const totalClean = allStats.reduce((n, s) => n + s.skipped, 0);
  const totalFailed = allStats.reduce((n, s) => n + s.failed, 0);

  console.log("\n═══════════════════════════════════════════════════");
  console.log("                     SUMMARY                       ");
  console.log("═══════════════════════════════════════════════════");
  console.log(`Reviewed:           ${totalProcessed}`);
  console.log(`  Clean (no change): ${totalClean}`);
  console.log(`  Fixed:             ${totalFixed}`);
  console.log(`  Mostly fake:       ${totalHallucinated} (lyrics cleared)`);
  console.log(`  Failed:            ${totalFailed}`);
  console.log("");

  // Cost estimate: Haiku is ~$0.25/1M input, $1.25/1M output
  // Average lyrics ~500 tokens input, ~300 tokens output
  const estimatedCost = totalProcessed * 0.0005;
  console.log(`Estimated Claude Haiku cost: ~$${estimatedCost.toFixed(2)}`);
}

main().catch(console.error);
