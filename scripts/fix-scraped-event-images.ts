/**
 * Fix broken images for scraped events
 *
 * Usage:
 *   bun run scripts/fix-scraped-event-images.ts [--dry-run]
 *
 * This script:
 * 1. Finds events imported from external platforms (Facebook, Instagram, etc.)
 * 2. Checks if their image_url points to external CDNs that likely expired
 * 3. Attempts to re-download the image (some may still work)
 * 4. Falls back to additional_images in source_metadata if available
 * 5. Uploads to Supabase Storage for permanent hosting
 */

import { createClient } from "@supabase/supabase-js";

const EXTERNAL_CDN_PATTERNS = [
  "fbcdn.net",
  "cdninstagram.com",
  "instagram.com",
  "scontent.",
  "tiktokcdn.com",
  "p16-sign.",
  "muscdn.com",
];

function isExternalCdnUrl(url: string | null): boolean {
  if (!url) return false;
  return EXTERNAL_CDN_PATTERNS.some((pattern) => url.includes(pattern));
}

function isAlreadyInStorage(url: string | null): boolean {
  if (!url) return false;
  // Check if already in our Supabase storage
  return url.includes("supabase.co/storage") || url.includes("/event-media/");
}

async function downloadAndUploadImage(
  supabase: ReturnType<typeof createClient>,
  externalUrl: string,
  eventSlug: string
): Promise<string | null> {
  try {
    const response = await fetch(externalUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; DalatApp/1.0; +https://dalat.app)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    // Skip if too small or too large
    if (buffer.byteLength < 1000 || buffer.byteLength > 10 * 1024 * 1024) {
      return null;
    }

    const extMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const ext = extMap[contentType] || "jpg";
    const fileName = `${eventSlug}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("event-media")
      .upload(fileName, buffer, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.warn(`  Upload failed: ${uploadError.message}`);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("event-media").getPublicUrl(fileName);

    return publicUrl;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     Fix Scraped Event Images                                   ║
╠════════════════════════════════════════════════════════════════╣
║  Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will update database)"}
╚════════════════════════════════════════════════════════════════╝
`);

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get ALL events with image URLs (not just scraped ones)
  // Manual events might also have pasted external CDN URLs
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, slug, title, image_url, source_platform, source_metadata")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false });

  if (eventsError) {
    console.error("❌ Failed to fetch events:", eventsError.message);
    process.exit(1);
  }

  console.log(`Found ${events?.length ?? 0} events with images\n`);

  if (!events || events.length === 0) {
    console.log("✅ No events with images found!");
    process.exit(0);
  }

  // Filter to events that need fixing
  const needsFixing = events.filter((event) => {
    // Skip if no image or already in our storage
    if (!event.image_url) return false;
    if (isAlreadyInStorage(event.image_url)) return false;
    // Only fix external CDN URLs
    return isExternalCdnUrl(event.image_url);
  });

  console.log(`${needsFixing.length} events have external CDN images that need fixing\n`);

  if (needsFixing.length === 0) {
    console.log("✅ All images are already in our storage!");
    process.exit(0);
  }

  let fixed = 0;
  let cleared = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of needsFixing) {
    console.log(`\n📷 Processing: "${event.title?.substring(0, 50)}..."`);
    console.log(`   Platform: ${event.source_platform}`);
    console.log(`   Current URL: ${event.image_url?.substring(0, 60)}...`);

    if (dryRun) {
      console.log("   ⏩ Would attempt to download and re-upload (or clear if expired)");
      skipped++;
      continue;
    }

    // Try the current image_url first
    let newImageUrl = await downloadAndUploadImage(
      supabase,
      event.image_url!,
      event.slug
    );

    // If that failed, try additional_images from source_metadata
    if (!newImageUrl && event.source_metadata?.additional_images) {
      const additionalImages = event.source_metadata.additional_images as string[];
      console.log(`   Primary failed, trying ${additionalImages.length} additional images...`);

      for (const altUrl of additionalImages) {
        newImageUrl = await downloadAndUploadImage(supabase, altUrl, event.slug);
        if (newImageUrl) break;
      }
    }

    if (newImageUrl) {
      // Update the event with the new permanent URL
      const { error: updateError } = await supabase
        .from("events")
        .update({ image_url: newImageUrl })
        .eq("id", event.id);

      if (updateError) {
        console.log(`   ❌ Failed to update: ${updateError.message}`);
        failed++;
      } else {
        console.log(`   ✅ Fixed! New URL: ${newImageUrl.substring(0, 60)}...`);
        fixed++;
      }
    } else {
      // Image expired - set to null so app shows default image
      console.log("   ⚠️ Image expired, setting to null (will show default)");
      const { error: updateError } = await supabase
        .from("events")
        .update({ image_url: null })
        .eq("id", event.id);

      if (updateError) {
        console.log(`   ❌ Failed to clear: ${updateError.message}`);
        failed++;
      } else {
        console.log(`   ✅ Cleared broken URL`);
        cleared++;
      }
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    Fix Images Summary                          ║
╠════════════════════════════════════════════════════════════════╣
║  Events checked: ${needsFixing.length.toString().padEnd(42)}
║  Re-uploaded to storage: ${fixed.toString().padEnd(35)}
║  Cleared (will show default): ${cleared.toString().padEnd(30)}
║  Failed: ${failed.toString().padEnd(51)}
║  Skipped (dry run): ${skipped.toString().padEnd(40)}
╚════════════════════════════════════════════════════════════════╝
`);

  if (dryRun) {
    console.log("💡 This was a DRY RUN. Run without --dry-run to apply changes.\n");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
