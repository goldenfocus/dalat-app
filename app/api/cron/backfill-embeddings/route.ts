import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Replicate from "replicate";

// CLIP model on Replicate
const CLIP_MODEL = "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a";

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

    // Find moments without embeddings (photos only, published status)
    const { data: moments, error: fetchError } = await supabase
      .from("moments")
      .select("id, media_url")
      .eq("status", "published")
      .eq("content_type", "photo")
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (fetchError) {
      console.error("[backfill] Failed to fetch moments:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch moments" },
        { status: 500 }
      );
    }

    if (!moments || moments.length === 0) {
      return NextResponse.json({
        message: "No moments found to process",
        processed: 0,
      });
    }

    // Check which moments already have embeddings
    const momentIds = moments.map((m) => m.id);
    const { data: existingEmbeddings, error: embeddingError } = await supabase
      .from("moment_embeddings")
      .select("moment_id")
      .in("moment_id", momentIds);

    if (embeddingError) {
      console.error("[backfill] Failed to check existing embeddings:", embeddingError);
      return NextResponse.json(
        { error: "Failed to check existing embeddings" },
        { status: 500 }
      );
    }

    const existingIds = new Set((existingEmbeddings || []).map((e) => e.moment_id));
    const momentsToProcess = moments.filter((m) => !existingIds.has(m.id));

    if (dryRun) {
      return NextResponse.json({
        message: "Dry run - no embeddings generated",
        totalMoments: moments.length,
        alreadyHaveEmbeddings: existingIds.size,
        needEmbeddings: momentsToProcess.length,
      });
    }

    if (momentsToProcess.length === 0) {
      return NextResponse.json({
        message: "All moments already have embeddings",
        processed: 0,
        skipped: moments.length,
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

    let successCount = 0;
    let errorCount = 0;
    const errors: { id: string; error: string }[] = [];

    for (const moment of momentsToProcess) {
      try {
        if (!moment.media_url) continue;

        // Generate CLIP embedding
        const rawOutput = await replicate.run(CLIP_MODEL, {
          input: { image: moment.media_url },
        });

        // Parse response - model returns [{embedding: [...]}]
        let output: number[];
        if (Array.isArray(rawOutput) && rawOutput.length > 0 && (rawOutput[0] as { embedding?: number[] })?.embedding) {
          output = (rawOutput[0] as { embedding: number[] }).embedding;
        } else if (Array.isArray(rawOutput) && rawOutput.length === 768 && typeof rawOutput[0] === "number") {
          output = rawOutput as number[];
        } else {
          errors.push({ id: moment.id, error: "Unexpected response format" });
          errorCount++;
          continue;
        }

        if (!output || !Array.isArray(output) || output.length !== 768) {
          errors.push({ id: moment.id, error: `Invalid embedding length: ${output?.length}` });
          errorCount++;
          continue;
        }

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
      } catch (err) {
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
