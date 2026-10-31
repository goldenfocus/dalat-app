import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { parse as readExif } from "exifr";
import { R2StorageProvider } from "@/lib/storage/r2";
import { DriveClient, type DriveFile } from "./drive";
import { SOURCE, resolveCaptureTime, matchPhoto, type PhotoEvent } from "./matching";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function momentId(fileId: string) {
  const hex = sha(`${SOURCE.id}:${fileId}`);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function fingerprint(file: DriveFile) {
  return sha(JSON.stringify([file.md5Checksum, file.size, file.modifiedTime, file.imageMediaMetadata?.time, file.names]));
}
export async function syncDrivePhotos(apiKey: string) {
  const started = Date.now(); const token = randomUUID();
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
  const claimed = await db.rpc("claim_drive_photo_sync", { p_source: SOURCE.id, p_token: token });
  if (claimed.error) throw new Error(`Sync lease unavailable: ${claimed.error.code}`);
  if (!claimed.data) return { state: "not_due_or_running" };
  const credit = async (id: string) => {
    const result = await db.from("moment_venue_credits").upsert({ moment_id: id, venue_id: SOURCE.venueId }, { onConflict: "moment_id" });
    if (result.error) throw new Error(`Import ledger credit failed: ${result.error.code}`);
  };
  const report = { state: "complete", seen: 0, imported: 0, duplicates: 0, held: 0, failed: 0, remaining: 0 };
  let nextMinutes = 30;
  try {
    const drive = new DriveClient(apiKey);
    const files = await drive.list(SOURCE.folderId); report.seen = files.length;
    const eventsResult = await db.from("events").select("id,slug,starts_at,ends_at,venue_id,series_id,created_by,status,tribe_id,tribe_visibility")
      .eq("venue_id", SOURCE.venueId).eq("series_id", SOURCE.seriesId).eq("status", "published").order("starts_at", {ascending: true}).limit(1000);
    if (eventsResult.error) throw new Error(`Event lookup failed: ${eventsResult.error.code}`);
    const events = (eventsResult.data || []).filter(e => !e.tribe_id || e.tribe_visibility === "public") as PhotoEvent[];
    // Stay attentive for one week after events; otherwise do a daily full-tree sweep.
    const recentlyEnded = events.some(e => Date.parse(e.ends_at || e.starts_at) <= started && Date.parse(e.ends_at || e.starts_at) > started - 7*86400000);
    nextMinutes = recentlyEnded ? 30 : 24*60;
    const ledger = new Map<string, {fingerprint:string;status:string;checked_at:string;moment_id:string|null;event_id:string|null}>();
    for (let offset=0;;offset+=1000) {
      const rows = await db.from("drive_photo_imports").select("file_id,fingerprint,status,checked_at,moment_id,event_id").eq("source_id", SOURCE.id).order("file_id").range(offset,offset+999);
      if (rows.error) throw new Error(`Import ledger unavailable: ${rows.error.code}`);
      for (const r of rows.data || []) ledger.set(r.file_id, r);
      if ((rows.data?.length || 0) < 1000) break;
    }
    // Unseen first, then least-recently-checked: a bad file cannot starve a batch.
    const pending = files.filter(f => {
      const prior=ledger.get(f.id);
      return !prior || !["imported","duplicate"].includes(prior.status) || prior.fingerprint !== fingerprint(f);
    }).sort((a,b) => (ledger.get(a.id)?.checked_at || "").localeCompare(ledger.get(b.id)?.checked_at || "") || a.id.localeCompare(b.id));
    let storage: R2StorageProvider | undefined;
    let attempted = 0;
    for (const file of pending) {
      if (attempted >= 12 || Date.now() - started > 190000) break;
      attempted++;
      const fp = fingerprint(file); const prior = ledger.get(file.id);
      const save = async (status: "imported"|"duplicate"|"held"|"failed", reason: string | null, eventId: string | null = null, id: string | null = null) => {
        const result = await db.from("drive_photo_imports").upsert({ source_id: SOURCE.id, file_id: file.id, fingerprint: fp, source_path: file.names,
          source_url: `https://drive.google.com/file/d/${file.id}/view`, event_id: eventId, moment_id: id, status, reason, checked_at: new Date().toISOString() }, {onConflict:"source_id,file_id"});
        if (result.error) throw new Error(`Import ledger write failed: ${result.error.code}`);
      };
      try {
        // Imported files are immutable. An edited/replaced source needs review, never an overwrite.
        if (prior?.moment_id || (prior && ["imported","duplicate"].includes(prior.status))) {
          await save("held", "Previously imported source changed; review before reimporting", prior.event_id, prior.moment_id); report.held++; continue;
        }
        if (file.modifiedTime && Date.parse(file.modifiedTime) > Date.now()-120000) {
          await save("held", "File changed in the last two minutes; retry when settled"); report.held++; continue;
        }
        const original = await drive.download(file);
        if (file.md5Checksum && createHash("md5").update(original).digest("hex") !== file.md5Checksum) throw new Error("Source changed while downloading; retry next scan");
        // Read date only. GPS and all other EXIF are stripped from the public derivative.
        const exif = await readExif(original, { pick: ["DateTimeOriginal", "OffsetTimeOriginal"], reviveValues: false }).catch(() => null);
        const rawExif = exif?.DateTimeOriginal;
        const capture = resolveCaptureTime(file.imageMediaMetadata?.time,
          typeof rawExif === "string" ? rawExif : undefined,
          typeof exif?.OffsetTimeOriginal === "string" ? exif.OffsetTimeOriginal : undefined);
        if (capture.conflict) {
          await save("held", "Drive and embedded capture timestamps disagree"); report.held++; continue;
        }
        const match = matchPhoto(file.names, capture.captured, events);
        if ("reason" in match) { await save("held", match.reason); report.held++; continue; }
        // Re-read visibility and posting settings immediately before publishing.
        const fresh = await db.from("events").select("status,venue_id,series_id,created_by,tribe_id,tribe_visibility").eq("id",match.event.id).single();
        if (fresh.error) throw new Error(`Event recheck failed: ${fresh.error.code}`);
        const e = fresh.data;
        if (e.status !== "published" || e.venue_id !== SOURCE.venueId || e.series_id !== SOURCE.seriesId || (e.tribe_id && e.tribe_visibility !== "public")) {
          await save("held", "Event visibility or source association changed"); report.held++; continue;
        }
        const settings = await db.from("event_settings").select("moments_enabled,moments_require_approval").eq("event_id",match.event.id).maybeSingle();
        if (settings.error) throw new Error(`Event settings failed: ${settings.error.code}`);
        if (settings.data?.moments_enabled === false || settings.data?.moments_require_approval === true) {
          await save("held", "Event uploads disabled or moderation required"); report.held++; continue;
        }
        const id = momentId(file.id); const hash = sha(original);
        const exists = await db.from("moments").select("id").eq("id", id).maybeSingle();
        if (exists.error) throw new Error(`Duplicate lookup failed: ${exists.error.code}`);
        if (exists.data) { await credit(id); await save("imported", "Recovered existing import",match.event.id,id); report.duplicates++; continue; }
        const duplicate = await db.from("moments").select("id").eq("event_id",match.event.id).eq("file_hash",hash).limit(1);
        if (duplicate.error) throw new Error(`Hash lookup failed: ${duplicate.error.code}`);
        if (duplicate.data?.length) { await save("duplicate", "Identical photo already in event",match.event.id,duplicate.data[0].id); report.duplicates++; continue; }
        // Decode real image content; normalize orientation, bound size, and discard metadata.
        let decoded = original;
        if (["image/heic", "image/heif"].includes(file.mimeType)) {
          const convert = (await import("heic-convert")).default;
          decoded = Buffer.from(await convert({buffer: original,format:"JPEG",quality:0.95}));
        }
        const photo = await sharp(decoded, { limitInputPixels: 80000000 }).rotate().resize(2400,2400,{fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
        const thumbnail = await sharp(photo).resize(480,480,{fit:"inside",withoutEnlargement:true}).jpeg({quality:80}).toBuffer();
        const path = `${match.event.id}/drive/${id}`;
        storage ??= new R2StorageProvider();
        const url = await storage.upload("moments", `${path}.jpg`, photo, {contentType:"image/jpeg"});
        const thumb = await storage.upload("moments", `${path}-thumb.jpg`, thumbnail, {contentType:"image/jpeg"});
        const insert = await db.from("moments").insert({ id, event_id: match.event.id, user_id: e.created_by, content_type:"photo", media_url:url, thumbnail_url:thumb,
          file_hash:hash, captured_at:match.capturedAt, status:"published", source_locale:"en" });
        if (insert.error && insert.error.code !== "23505") throw new Error(`Moment insert failed: ${insert.error.code}`);
        if (insert.error) {
          const recovery = await db.from("moments").select("id").eq("id",id).maybeSingle();
          if (recovery.error || !recovery.data) throw new Error("Unexpected duplicate constraint; review import");
        }
        await credit(id);
        await save("imported",null,match.event.id,id); report.imported++;
      } catch (error) {
        // Only controlled messages; decoder/transport errors can include untrusted data or URLs.
        const message = error instanceof Error && /^(Source changed|Event |Import ledger|Duplicate lookup|Hash lookup|Moment insert|Unexpected duplicate|Google Drive|Owner has|Photo exceeds|Empty )/.test(error.message)
          ? error.message.slice(0,180) : "Photo download, decode, or storage failed; retry next scan";
        await save("failed",message); report.failed++;
      }
    }
    report.remaining = pending.length - attempted;
    if (report.remaining || report.failed) nextMinutes = 30;
    return report;
  } catch (error) {
    report.state = "failed"; report.failed++;
    throw error;
  } finally {
    const result = await db.from("drive_photo_sync_state").update({ lease_token:null, lease_until:null, last_scan_at: new Date().toISOString(), last_report:report,
      next_scan_at:new Date(Date.now()+nextMinutes*60000).toISOString() }).eq("source_id",SOURCE.id).eq("lease_token",token);
    if (result.error) console.error("[drive-photos] heartbeat write failed",result.error.code);
  }
}
