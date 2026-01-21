import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Replicate from "replicate";

// CLIP model on Replicate
const CLIP_MODEL = "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a";

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

export async function POST(request: Request) {
  try {
    const { momentId, momentIds } = await request.json();

    // Support single or batch embedding
    const idsToProcess = momentIds || (momentId ? [momentId] : []);

    if (idsToProcess.length === 0) {
      return NextResponse.json(
        { error: "momentId or momentIds required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    if (!supabase) {
      console.error("[embed] Service client not available");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 503 }
      );
    }

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    if (!replicateToken) {
      console.error("[embed] Replicate API token not configured");
      return NextResponse.json(
        { error: "Embedding service not configured" },
        { status: 503 }
      );
    }

    const replicate = new Replicate({ auth: replicateToken });

    // Fetch moments that need embedding
    const { data: moments, error: fetchError } = await supabase
      .from("moments")
      .select("id, media_url, content_type")
      .in("id", idsToProcess)
      .eq("status", "published");

    if (fetchError) {
      console.error("[embed] Failed to fetch moments:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch moments" },
        { status: 500 }
      );
    }

    if (!moments || moments.length === 0) {
      return NextResponse.json(
        { error: "No valid moments found" },
        { status: 404 }
      );
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const moment of moments) {
      try {
        // Skip text-only moments (no visual content to embed)
        if (moment.content_type === "text" || !moment.media_url) {
          results.push({ id: moment.id, success: false, error: "No visual content" });
          continue;
        }

        // For videos, we'd ideally extract a frame - for now, skip them
        // TODO: Add video frame extraction support
        if (moment.content_type === "video") {
          results.push({ id: moment.id, success: false, error: "Video embedding not yet supported" });
          continue;
        }

        // Generate CLIP embedding for image
        const rawOutput = await replicate.run(CLIP_MODEL, {
          input: { image: moment.media_url },
        });

        // Parse response - model returns [{embedding: [...]}]
        let output: number[];
        if (Array.isArray(rawOutput) && rawOutput.length > 0 && rawOutput[0]?.embedding) {
          output = rawOutput[0].embedding;
        } else if (Array.isArray(rawOutput) && rawOutput.length === 768 && typeof rawOutput[0] === "number") {
          output = rawOutput;
        } else {
          console.error("[embed] Unexpected response format for moment:", moment.id);
          results.push({ id: moment.id, success: false, error: "Unexpected response format" });
          continue;
        }

        if (!output || !Array.isArray(output) || output.length !== 768) {
          console.error("[embed] Invalid embedding length for moment:", moment.id, output?.length);
          results.push({ id: moment.id, success: false, error: "Invalid embedding response" });
          continue;
        }

        // Format embedding as pgvector expects: [0.1, 0.2, ...]
        const embeddingString = `[${output.join(",")}]`;

        // Upsert embedding
        const { error: upsertError } = await supabase
          .from("moment_embeddings")
          .upsert({
            moment_id: moment.id,
            embedding: embeddingString,
          });

        if (upsertError) {
          console.error("[embed] Failed to store embedding:", upsertError);
          results.push({ id: moment.id, success: false, error: "Failed to store embedding" });
          continue;
        }

        results.push({ id: moment.id, success: true });
      } catch (err) {
        console.error("[embed] Error processing moment:", moment.id, err);
        results.push({
          id: moment.id,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json({
      processed: results.length,
      success: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error) {
    console.error("[embed] Embedding error:", error);
    return NextResponse.json(
      { error: "Failed to generate embeddings" },
      { status: 500 }
    );
  }
}
