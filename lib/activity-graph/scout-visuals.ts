import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { R2StorageProvider } from "@/lib/storage/r2";
import type { ActivityCuratedMedia, ActivityCuratedMediaItem } from "./types";

export interface ScoutVisualAssetInput {
  localPath: string;
  title: string;
  altText: string;
  caption: string;
  provenance: "ai_generated" | "owner_authorized_source";
  sourceUrl: string | null;
  authorizationUrl: string | null;
  authorizationEvidenceText: string | null;
}

export interface ScoutVisualBundleInput {
  hero: ScoutVisualAssetInput;
  promo: ScoutVisualAssetInput[];
}

interface PreparedFile {
  buffer: Buffer;
  digest: string;
  extension: "png" | "jpg" | "webp";
  mimeType: ActivityCuratedMediaItem["mimeType"];
  originalFilename: string;
  fileSize: number;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_BYTES = 50 * 1024;
const MANAGED_MEDIA_PATH = "public/images/activity-graph";
const MANAGED_CDN_MARKER = "/event-materials/activity-graph/";

function detectRaster(
  buffer: Buffer,
): Pick<PreparedFile, "extension" | "mimeType"> {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  throw new Error(
    "Scout visual must be a real PNG, JPEG, or WebP raster image",
  );
}

async function readManagedVisual(localPath: string): Promise<PreparedFile> {
  if (path.isAbsolute(localPath)) {
    throw new Error(
      "Scout visual localPath must be relative to the project checkout",
    );
  }
  const root = await realpath(process.cwd());
  const managedRoot = await realpath(path.join(root, MANAGED_MEDIA_PATH));
  const resolved = await realpath(path.resolve(root, localPath));
  if (
    resolved !== managedRoot &&
    !resolved.startsWith(`${managedRoot}${path.sep}`)
  ) {
    throw new Error(`Scout visuals must live under ${MANAGED_MEDIA_PATH}`);
  }
  const fileStat = await stat(resolved);
  if (
    !fileStat.isFile() ||
    fileStat.size < MIN_IMAGE_BYTES ||
    fileStat.size > MAX_IMAGE_BYTES
  ) {
    throw new Error("Scout visual must be a 50 KB to 20 MB image file");
  }
  const buffer = await readFile(resolved);
  const raster = detectRaster(buffer);
  return {
    buffer,
    digest: createHash("sha256").update(buffer).digest("hex"),
    ...raster,
    originalFilename: path.basename(resolved),
    fileSize: fileStat.size,
  };
}

function mediaTitle(value: ScoutVisualAssetInput): string {
  return value.title.trim();
}

export async function uploadScoutVisualBundle(options: {
  sourceUid: string;
  activitySourceUrl: string;
  visuals: ScoutVisualBundleInput;
}): Promise<ActivityCuratedMedia> {
  const inputs = [options.visuals.hero, ...options.visuals.promo];
  const prepared = await Promise.all(
    inputs.map((item) => readManagedVisual(item.localPath)),
  );
  const uniqueDigests = new Set(prepared.map((item) => item.digest));
  if (uniqueDigests.size !== prepared.length) {
    throw new Error("Hero and promo visuals must be distinct images");
  }

  const storage = new R2StorageProvider();
  const activityKey = createHash("sha256")
    .update(options.sourceUid)
    .digest("hex")
    .slice(0, 20);
  const uploaded: ActivityCuratedMediaItem[] = [];
  for (let index = 0; index < inputs.length; index++) {
    const input = inputs[index];
    const file = prepared[index];
    const role = index === 0 ? "hero" : `promo-${index}`;
    const fileName = `${role}-${file.digest.slice(0, 16)}.${file.extension}`;
    const url = await storage.upload(
      "event-materials",
      `activity-graph/${activityKey}/${fileName}`,
      file.buffer,
      { contentType: file.mimeType },
    );
    uploaded.push({
      url,
      title: mediaTitle(input),
      altText: input.altText.trim(),
      caption: input.caption.trim(),
      provenance: input.provenance,
      sourceUrl: input.sourceUrl ?? options.activitySourceUrl,
      authorizationUrl: input.authorizationUrl,
      originalFilename: file.originalFilename,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
    });
  }
  return { hero: uploaded[0], promo: uploaded.slice(1) };
}

function isManagedPromoUrl(value: unknown): value is string {
  return typeof value === "string" && value.includes(MANAGED_CDN_MARKER);
}

export async function syncScoutPromoMedia(options: {
  supabase: SupabaseClient;
  eventId?: string;
  eventSeriesId?: string;
  media: ActivityCuratedMedia;
}): Promise<void> {
  const target = options.eventId
    ? { table: "events", idColumn: "event_id", id: options.eventId }
    : options.eventSeriesId
      ? {
          table: "event_series",
          idColumn: "series_id",
          id: options.eventSeriesId,
        }
      : null;
  if (!target) return;

  const { data: owner, error: ownerError } = await options.supabase
    .from(target.table)
    .select("id,created_by,source_platform")
    .eq("id", target.id)
    .maybeSingle();
  if (ownerError)
    throw new Error(`Scout promo owner lookup failed: ${ownerError.message}`);
  if (!owner || owner.source_platform !== "activity-graph") return;

  const desired = options.media.promo;
  const desiredUrls = new Set(desired.map((item) => item.url));
  const { data: existing, error: existingError } = await options.supabase
    .from("promo_media")
    .select("id,media_url")
    .eq(target.idColumn, target.id);
  if (existingError)
    throw new Error(`Scout promo lookup failed: ${existingError.message}`);

  const managed = (existing ?? []).filter((row) =>
    isManagedPromoUrl(row.media_url),
  );
  const staleIds = managed
    .filter((row) => !desiredUrls.has(row.media_url as string))
    .map((row) => row.id as string);
  if (staleIds.length > 0) {
    const { error } = await options.supabase
      .from("promo_media")
      .delete()
      .in("id", staleIds);
    if (error)
      throw new Error(`Stale scout promo cleanup failed: ${error.message}`);
  }

  for (let index = 0; index < desired.length; index++) {
    const item = desired[index];
    const row = {
      [target.idColumn]: target.id,
      media_type: "image",
      media_url: item.url,
      thumbnail_url: item.url,
      original_filename: item.originalFilename,
      file_size: item.fileSize,
      mime_type: item.mimeType,
      title:
        item.provenance === "ai_generated"
          ? `AI-generated illustration — ${item.title}`
          : item.title,
      caption: item.caption,
      sort_order: index,
      is_ai_suggested: item.provenance === "ai_generated",
      created_by: owner.created_by,
    };
    const found = managed.find((entry) => entry.media_url === item.url);
    const query = found
      ? options.supabase.from("promo_media").update(row).eq("id", found.id)
      : options.supabase.from("promo_media").insert(row);
    const { error } = await query;
    if (error) throw new Error(`Scout promo sync failed: ${error.message}`);
  }

  if (options.eventId) {
    const { error } = await options.supabase
      .from("events")
      .update({ has_promo_override: true })
      .eq("id", options.eventId);
    if (error)
      throw new Error(`Scout promo override update failed: ${error.message}`);
  }
}
