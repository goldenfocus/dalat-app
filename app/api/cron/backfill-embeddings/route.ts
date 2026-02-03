import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Replicate from "replicate";

// CLIP model on Replicate (krthr/clip-embeddings works correctly, andreasjansson is broken)
const CLIP_MODEL = "krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4";

// Process in batches to avoid timeouts
const BATCH_SIZE = 50;

/**
 * Create a service role Supabase client for bypassing RLS.
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createSupabaseClient(url, serviceKey);
}

/**
 * Backfill embeddings for moments that don't have them yet.
 * Can be called manually or scheduled as a cron job.
 *
 * Query params:
 * - limit: Max moments to process (default: 50)
 * - dryRun: If true, just count moments without embeddings (default: false)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || String(BATCH_SIZE)), 200);
    const dryRun = searchParams.get("dryRun") === "true";

    const supabase = createServiceClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 503 }
      );
    }

    // First, get IDs of moments that already have embeddings
    const { data: existingEmbeddings, error: embeddingError } = await supabase
      .from("moment_embeddings")
      .select("moment_id");

    if (embeddingError) {
      console.error("[backfill] Failed to check existing embeddings:", embeddingError);
      return NextResponse.json(
        { error: "Failed to check existing embeddings" },
        { status: 500 }
      );
    }

    const existingIds = new Set((existingEmbeddings || []).map((e) => e.moment_id));

    // Find moments without embeddings (photos only, published status)
    // Query more than needed to account for filtering
    const { data: allMoments, error: fetchError } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("status", "published")
      .eq("content_type", "photo")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit * 10); // Fetch more to find unembedded ones

    if (fetchError) {
      console.error("[backfill] Failed to fetch moments:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch moments" },
        { status: 500 }
      );
    }

    if (!allMoments || allMoments.length === 0) {
      return NextResponse.json({
        message: "No moments found to process",
        processed: 0,
      });
    }

    // Filter to only moments without embeddings, then take the limit
    const momentsToProcess = allMoments
      .filter((m) => !existingIds.has(m.id))
      .slice(0, limit);

    if (dryRun) {
      return NextResponse.json({
        message: "Dry run - no embeddings generated",
        totalMoments: allMoments.length,
        alreadyHaveEmbeddings: existingIds.size,
        needEmbeddings: momentsToProcess.length,
      });
    }

    if (momentsToProcess.length === 0) {
      return NextResponse.json({
        message: "All moments already have embeddings",
        processed: 0,
        skipped: allMoments.length,
      });
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      return NextResponse.json(
        { error: "Replicate API token not configured" },
        { status: 503 }
      );
    }

    const replicate = new Replicate({ auth: replicateToken });

    // Rate limit delay (ms) - Replicate limits to 6/min with <$5 credit
    const rateLimitDelay = parseInt(searchParams.get("delay") || "10000");

    let successCount = 0;
    let errorCount = 0;
    const errors: { id: string; error: string }[] = [];

    // Track embeddings to detect duplicates (a sign of broken API responses)
    const seenEmbeddings = new Map<string, string>(); // hash -> moment_id

    for (let i = 0; i < momentsToProcess.length; i++) {
      const moment = momentsToProcess[i];

      // Add delay between requests to respect rate limits (skip first)
      if (i > 0 && rateLimitDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
      }
      try {
        if (!moment.media_url) continue;

        console.log(`[backfill] Processing ${i + 1}/${momentsToProcess.length}: ${moment.id}`);
        console.log(`[backfill] Image URL: ${moment.media_url.substring(0, 100)}...`);

        // Generate CLIP embedding
        const rawOutput = await replicate.run(CLIP_MODEL, {
          input: { image: moment.media_url },
        });

        // Parse response - krthr model returns {embedding: [...]}
        let output: number[];
        if (rawOutput && typeof rawOutput === "object" && !Array.isArray(rawOutput) && (rawOutput as { embedding?: number[] }).embedding) {
          // krthr/clip-embeddings returns {embedding: [...]}
          output = (rawOutput as { embedding: number[] }).embedding;
        } else if (Array.isArray(rawOutput) && rawOutput.length > 0 && (rawOutput[0] as { embedding?: number[] })?.embedding) {
          // andreasjansson model returns [{embedding: [...]}]
          output = (rawOutput[0] as { embedding: number[] }).embedding;
        } else if (Array.isArray(rawOutput) && rawOutput.length === 768 && typeof rawOutput[0] === "number") {
          output = rawOutput as number[];
        } else {
          console.error(`[backfill] Unexpected format for ${moment.id}:`, JSON.stringify(rawOutput).substring(0, 200));
          errors.push({ id: moment.id, error: "Unexpected response format" });
          errorCount++;
          continue;
        }

        if (!output || !Array.isArray(output) || output.length !== 768) {
          errors.push({ id: moment.id, error: `Invalid embedding length: ${output?.length}` });
          errorCount++;
          continue;
        }

        // Check for duplicate embeddings (sign of API failure)
        const embeddingHash = output.slice(0, 10).join(",");
        const existingId = seenEmbeddings.get(embeddingHash);
        if (existingId) {
          console.error(`[backfill] DUPLICATE EMBEDDING DETECTED! ${moment.id} matches ${existingId}`);
          console.error(`[backfill] First 5 values: ${output.slice(0, 5).join(", ")}`);
          errors.push({ id: moment.id, error: `Duplicate embedding (matches ${existingId})` });
          errorCount++;
          continue;
        }
        seenEmbeddings.set(embeddingHash, moment.id);

        console.log(`[backfill] Embedding generated: [${output.slice(0, 3).join(", ")}...] (768 dims)`);

        // Format and store embedding
        const embeddingString = `[${output.join(",")}]`;
        const { error: upsertError } = await supabase
          .from("moment_embeddings")
          .upsert({
            moment_id: moment.id,
            embedding: embeddingString,
          });

        if (upsertError) {
          errors.push({ id: moment.id, error: upsertError.message });
          errorCount++;
          continue;
        }

        successCount++;
        console.log(`[backfill] Success: ${moment.id} (${successCount}/${momentsToProcess.length})`);
      } catch (err) {
        console.error(`[backfill] Error for ${moment.id}:`, err);
        errors.push({
          id: moment.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
        errorCount++;
      }
    }

    return NextResponse.json({
      message: "Backfill complete",
      processed: momentsToProcess.length,
      success: successCount,
      errors: errorCount,
      skipped: existingIds.size,
      errorDetails: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error("[backfill] Backfill error:", error);
    return NextResponse.json(
      { error: "Backfill failed" },
      { status: 500 }
    );
  }
}
