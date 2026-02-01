/**
 * Migrate existing files from Supabase Storage to Cloudflare R2
 *
 * This script:
 * 1. Lists all files in each Supabase bucket
 * 2. Downloads and re-uploads to R2
 * 3. Updates database URLs to point to R2
 *
 * Run with: npx tsx scripts/migrate-supabase-to-r2.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// Buckets to migrate
const BUCKETS = [
  "avatars",
  "event-media",
  "moments",
  "venue-media",
  "organizer-logos",
  "persona-references",
];

// Tables that store image URLs (bucket -> table/column mappings)
const URL_MAPPINGS: Record<
  string,
  Array<{ table: string; column: string; pathColumn?: string }>
> = {
  avatars: [{ table: "profiles", column: "avatar_url" }],
  "event-media": [{ table: "events", column: "image_url" }],
  moments: [{ table: "moments", column: "media_url" }],
  "venue-media": [
    { table: "venues", column: "cover_image_url" },
    // photos[] array needs special handling
  ],
  "organizer-logos": [{ table: "organizers", column: "logo_url" }],
  "persona-references": [
    // reference_images[] array needs special handling
  ],
};

// Initialize clients
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key);
}

function getR2Client() {
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error("Missing R2 credentials");
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getR2PublicUrl(bucket: string, path: string): string {
  const baseUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || "https://cdn.dalat.app";
  return `${baseUrl}/${bucket}/${path}`;
}

function getSupabasePublicUrl(bucket: string, path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

// Check if file already exists in R2
async function existsInR2(
  r2: S3Client,
  bucket: string,
  key: string
): Promise<boolean> {
  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: `${bucket}/${key}`,
      })
    );
    return true;
  } catch {
    return false;
  }
}

// Migrate a single file
async function migrateFile(
  supabase: ReturnType<typeof getSupabase>,
  r2: S3Client,
  bucket: string,
  path: string,
  stats: { migrated: number; skipped: number; failed: number }
): Promise<{ oldUrl: string; newUrl: string } | null> {
  const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
  const r2Key = `${bucket}/${path}`;

  // Check if already migrated
  if (await existsInR2(r2, bucket, path)) {
    stats.skipped++;
    return null;
  }

  try {
    // Download from Supabase
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error || !data) {
      console.error(`  Failed to download ${bucket}/${path}:`, error?.message);
      stats.failed++;
      return null;
    }

    // Upload to R2
    const buffer = Buffer.from(await data.arrayBuffer());
    const contentType = data.type || "application/octet-stream";

    await r2.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000",
      })
    );

    stats.migrated++;

    return {
      oldUrl: getSupabasePublicUrl(bucket, path),
      newUrl: getR2PublicUrl(bucket, path),
    };
  } catch (err) {
    console.error(`  Failed to migrate ${bucket}/${path}:`, err);
    stats.failed++;
    return null;
  }
}

// Update database URLs
async function updateDatabaseUrls(
  supabase: ReturnType<typeof getSupabase>,
  bucket: string,
  urlMap: Map<string, string>
): Promise<number> {
  const mappings = URL_MAPPINGS[bucket] || [];
  let updated = 0;

  for (const { table, column } of mappings) {
    // Get all rows with Supabase URLs
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .not(column, "is", null)
      .like(column, "%supabase.co/storage%");

    if (error) {
      console.error(`  Error fetching ${table}.${column}:`, error.message);
      continue;
    }

    for (const row of rows || []) {
      const oldUrl = row[column];
      const newUrl = urlMap.get(oldUrl);

      if (newUrl) {
        const { error: updateError } = await supabase
          .from(table)
          .update({ [column]: newUrl })
          .eq("id", row.id);

        if (!updateError) {
          updated++;
        } else {
          console.error(`  Failed to update ${table}/${row.id}:`, updateError.message);
        }
      }
    }
  }

  // Handle special cases: JSONB arrays
  if (bucket === "venue-media") {
    // Update venues.photos[] array
    const { data: venues } = await supabase
      .from("venues")
      .select("id, photos")
      .not("photos", "is", null);

    for (const venue of venues || []) {
      if (!Array.isArray(venue.photos)) continue;

      let changed = false;
      const newPhotos = venue.photos.map((photo: { url: string; caption?: string; sort_order: number }) => {
        const newUrl = urlMap.get(photo.url);
        if (newUrl) {
          changed = true;
          return { ...photo, url: newUrl };
        }
        return photo;
      });

      if (changed) {
        const { error } = await supabase
          .from("venues")
          .update({ photos: newPhotos })
          .eq("id", venue.id);

        if (!error) updated++;
      }
    }
  }

  if (bucket === "persona-references") {
    // Update personas.reference_images[] array
    const { data: personas } = await supabase
      .from("personas")
      .select("id, reference_images")
      .not("reference_images", "is", null);

    for (const persona of personas || []) {
      if (!Array.isArray(persona.reference_images)) continue;

      let changed = false;
      const newImages = persona.reference_images.map((url: string) => {
        const newUrl = urlMap.get(url);
        if (newUrl) {
          changed = true;
          return newUrl;
        }
        return url;
      });

      if (changed) {
        const { error } = await supabase
          .from("personas")
          .update({ reference_images: newImages })
          .eq("id", persona.id);

        if (!error) updated++;
      }
    }
  }

  return updated;
}

// List all files in a bucket
async function listBucketFiles(
  supabase: ReturnType<typeof getSupabase>,
  bucket: string
): Promise<string[]> {
  const files: string[] = [];

  async function listFolder(prefix: string = "") {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
    });

    if (error) {
      console.error(`Error listing ${bucket}/${prefix}:`, error.message);
      return;
    }

    for (const item of data || []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.metadata) {
        // It's a file
        files.push(path);
      } else {
        // It's a folder, recurse
        await listFolder(path);
      }
    }
  }

  await listFolder();
  return files;
}

// Main migration function
async function migrate() {
  console.log("=== Supabase to R2 Migration ===\n");

  // Check environment
  const requiredVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_ENDPOINT",
    "CLOUDFLARE_R2_PUBLIC_URL",
    "CLOUDFLARE_R2_BUCKET_NAME",
  ];

  for (const v of requiredVars) {
    if (!process.env[v]) {
      console.error(`Missing required env var: ${v}`);
      process.exit(1);
    }
  }

  const supabase = getSupabase();
  const r2 = getR2Client();

  const totalStats = { migrated: 0, skipped: 0, failed: 0, dbUpdated: 0 };

  for (const bucket of BUCKETS) {
    console.log(`\n--- Bucket: ${bucket} ---`);

    // List all files
    const files = await listBucketFiles(supabase, bucket);
    console.log(`Found ${files.length} files`);

    if (files.length === 0) continue;

    const stats = { migrated: 0, skipped: 0, failed: 0 };
    const urlMap = new Map<string, string>();

    // Migrate files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      process.stdout.write(`\r  Migrating ${i + 1}/${files.length}...`);

      const result = await migrateFile(supabase, r2, bucket, file, stats);
      if (result) {
        urlMap.set(result.oldUrl, result.newUrl);
      }
    }

    console.log(`\n  Migrated: ${stats.migrated}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`);

    // Update database URLs
    if (urlMap.size > 0) {
      console.log(`  Updating database URLs...`);
      const dbUpdated = await updateDatabaseUrls(supabase, bucket, urlMap);
      console.log(`  Updated ${dbUpdated} database records`);
      totalStats.dbUpdated += dbUpdated;
    }

    totalStats.migrated += stats.migrated;
    totalStats.skipped += stats.skipped;
    totalStats.failed += stats.failed;
  }

  console.log("\n=== Migration Complete ===");
  console.log(`Total migrated: ${totalStats.migrated}`);
  console.log(`Total skipped (already in R2): ${totalStats.skipped}`);
  console.log(`Total failed: ${totalStats.failed}`);
  console.log(`Database records updated: ${totalStats.dbUpdated}`);
}

// Run
migrate().catch(console.error);
