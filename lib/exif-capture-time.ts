/**
 * Extract the real capture time of a photo/video from its metadata.
 *
 * ⚠️ MUST run on the ORIGINAL File, before any other step touches it.
 *
 * `lib/image-compression.ts` redraws anything >3MB through a canvas, which drops
 * all EXIF, and then stamps `lastModified: Date.now()` — destroying the fallback
 * too. HEIC conversion strips metadata as well, and `/api/convert-heic-r2`
 * deletes the original from R2 afterwards. So there is no server-side recovery
 * path: if we don't read it here, the capture time is gone forever.
 *
 * (Recovering it later means perceptual-hash matching against the originals on
 * someone's laptop. That was done once for the bike tour. Once was enough.)
 */

// Da Lat is UTC+7. EXIF DateTimeOriginal is a *naive* local timestamp with no
// zone, so when the camera didn't record an offset we have to assume one.
// Assuming UTC instead would shift every photo 7 hours earlier.
const ASSUMED_UTC_OFFSET = "+07:00";

/**
 * Reject timestamps that can't be real, so a dead camera clock doesn't bury a
 * photo at the very top of the gallery forever.
 *
 * Cameras with a flat backup battery report 1970 / 1980 epoch defaults. A clock
 * set far in the future is rarer but equally disruptive under an ASC sort.
 * Anything implausible returns null and the row falls back to `created_at`,
 * which is exactly today's behaviour — so this can only improve ordering.
 */
function isPlausibleCaptureTime(date: Date): boolean {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return false;

  // Before digital cameras existed in any meaningful number.
  if (ms < Date.UTC(1990, 0, 1)) return false;

  // Allow a day of slack for clock skew across the 7+ devices a single event
  // can be shot on, but no more than that.
  if (ms > Date.now() + 24 * 60 * 60 * 1000) return false;

  return true;
}

/**
 * Turn EXIF's naive "2026:07:20 07:18:32" plus an optional "+07:00" offset into
 * a real instant. Returns null if the string isn't the shape we expect.
 */
function exifDateToISO(raw: string, offset?: string | null): string | null {
  const m = raw
    .trim()
    .match(/^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;

  const [, year, month, day, hour, minute, second] = m;

  // A camera that records an offset is telling us the truth; trust it over our
  // Da Lat assumption. Travellers' photos depend on this.
  const zone = /^[+-]\d{2}:\d{2}$/.test(offset?.trim() ?? "")
    ? offset!.trim()
    : ASSUMED_UTC_OFFSET;

  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`;
  const date = new Date(iso);

  return isPlausibleCaptureTime(date) ? date.toISOString() : null;
}

/**
 * Fall back to the filesystem timestamp.
 *
 * Phones set `lastModified` to the asset's creation date for camera-roll picks,
 * so this is genuinely useful — and unlike EXIF it's an absolute epoch, so
 * there's no timezone guesswork. It's also our only signal for video, where the
 * capture time lives in a QuickTime atom we don't parse yet.
 */
function lastModifiedToISO(file: File): string | null {
  if (!file.lastModified) return null;
  const date = new Date(file.lastModified);
  return isPlausibleCaptureTime(date) ? date.toISOString() : null;
}

/**
 * EXIF-only capture time — the trustworthy signal. Null for videos (their
 * capture time lives in a QuickTime atom exifr doesn't read) and for photos
 * whose metadata was stripped in transit (Zalo removes it entirely).
 */
async function extractExifISO(file: File): Promise<string | null> {
  if (file.type.startsWith("video/")) {
    return null;
  }

  try {
    // Dynamic import: exifr only loads on upload surfaces, not in the main bundle.
    const exifr = (await import("exifr")).default;

    // reviveValues: false keeps EXIF datetimes as raw strings. Left on, exifr
    // builds Date objects by interpreting the naive timestamp in the *browser's*
    // timezone — correct for a local uploader, wrong for anyone travelling, and
    // silently so. We'd rather do the zone maths explicitly above.
    const parsed = await exifr.parse(file, {
      reviveValues: false,
      pick: [
        "DateTimeOriginal",
        "OffsetTimeOriginal",
        "CreateDate",
        "OffsetTimeDigitized",
      ],
    });

    if (parsed) {
      // DateTimeOriginal is when the shutter fired. CreateDate is when the file
      // was written, which for most cameras is identical but for scanners and
      // some edit pipelines is not — hence the ordering.
      const fromOriginal = parsed.DateTimeOriginal
        ? exifDateToISO(String(parsed.DateTimeOriginal), parsed.OffsetTimeOriginal)
        : null;
      if (fromOriginal) return fromOriginal;

      const fromCreate = parsed.CreateDate
        ? exifDateToISO(String(parsed.CreateDate), parsed.OffsetTimeDigitized)
        : null;
      if (fromCreate) return fromCreate;
    }
  } catch {
    // No EXIF, a stripped file (Zalo removes it entirely), or a format exifr
    // can't read. Not an error worth surfacing — we just fall through.
  }

  return null;
}

/**
 * Best-effort capture time for a file, as an ISO string suitable for a
 * `timestamptz` column. Returns null when nothing trustworthy is available —
 * never a synthesised "now", which would be indistinguishable from upload time
 * and would defeat the whole point.
 *
 * If the file was part of a batch registered via `primeBatchCaptureTimes`,
 * the batch-inferred time is returned instead — it can see signals a single
 * file can't (filename sequence, timestamp clusters across the batch).
 *
 * @param file - the ORIGINAL File, straight from the picker
 */
export async function extractCaptureTime(file: File): Promise<string | null> {
  const primed = primedBatches.get(file);
  if (primed) return primed;

  // Solo path, same behaviour as ever: EXIF first, lastModified fallback.
  // `lastModified` is genuinely useful for camera-roll picks (phones set it to
  // the asset's creation date) — and for video it's the only signal, notably
  // safer than the MOV `CreateDate` atom, which is UTC and would land every
  // video 7 hours early.
  return (await extractExifISO(file)) ?? lastModifiedToISO(file);
}

// ---------------------------------------------------------------------------
// Batch inference — the AI Round Table fix (Jul 22 2026)
//
// Media that reaches the uploader through a transfer hop (AirDrop, Zalo,
// Google Photos) arrives with EXIF stripped from videos (always) and some
// photos, and lastModified rewritten to the *transfer* moment. A whole batch
// then claims to be "captured" inside one sub-minute window and piles up at
// the start of the gallery in random order.
//
// iPhone filenames (IMG_8306…) are a monotonic shoot-order sequence that
// survives every transfer. So: photos that kept EXIF act as anchors, and
// files with untrustworthy timestamps are slotted between their filename
// neighbours. IMG_8312.MOV lands between IMG_8311.JPG and IMG_8313.JPG.
// ---------------------------------------------------------------------------

export interface CaptureSignal {
  name: string;
  /** Trusted EXIF capture time, or null (videos, stripped photos). */
  exifISO: string | null;
  /** File mtime in epoch ms — real creation date OR transfer time, unknowable per-file. */
  lastModified: number | null;
}

/** ≥3 EXIF-less files whose mtimes sit this close = a transfer batch, not reality. */
const CLUSTER_WINDOW_MS = 60_000;
/** mtime within this of "now" = the picker re-exported the file at selection time. */
const NEAR_NOW_MS = 10 * 60_000;

/**
 * Filename → (family, sequence). Family is the text before the sequence run,
 * so `IMG_8306` can never interpolate against `Shot 2026-07-22 at 08.08.35`.
 */
function parseNameSeq(name: string): { family: string; seq: number } | null {
  const base = name.replace(/\.[^.]+$/, "");
  const m = base.match(/(\d{2,})(?!.*\d)/);
  if (!m || m.index === undefined) return null;
  return { family: base.slice(0, m.index), seq: parseInt(m[1], 10) };
}

/**
 * Pure inference core (exported for tests). Returns one ISO string or null
 * per input, same order. Trusted times pass through untouched; untrusted ones
 * are interpolated from same-family filename anchors, or — when a family has
 * no anchors at all — sequenced from the cluster's earliest mtime so filename
 * order is at least preserved.
 */
export function inferBatchCaptureTimes(
  signals: CaptureSignal[],
  nowMs: number = Date.now()
): (string | null)[] {
  const toISO = (ms: number) => {
    const d = new Date(ms);
    return isPlausibleCaptureTime(d) ? d.toISOString() : null;
  };

  const parsed = signals.map((s) => ({
    ...s,
    nameSeq: parseNameSeq(s.name),
    trustedMs: null as number | null,
  }));

  // Trust pass. EXIF always wins. lastModified survives only if it's neither
  // clustered with other fallback-only files nor stamped moments ago.
  const fallbackOnly = parsed.filter(
    (p) => !p.exifISO && p.lastModified && toISO(p.lastModified)
  );
  for (const p of parsed) {
    if (p.exifISO) {
      p.trustedMs = Date.parse(p.exifISO);
      continue;
    }
    if (!p.lastModified || !toISO(p.lastModified)) continue;
    const lm = p.lastModified;
    if (nowMs - lm < NEAR_NOW_MS) continue; // picker re-export
    const neighbours = fallbackOnly.filter(
      (o) => o !== p && Math.abs((o.lastModified as number) - lm) <= CLUSTER_WINDOW_MS
    ).length;
    if (neighbours >= 2) continue; // transfer cluster
    p.trustedMs = lm;
  }

  // Anchor map: family → trusted files with a sequence, sorted by sequence.
  const anchors = new Map<string, { seq: number; ms: number }[]>();
  for (const p of parsed) {
    if (p.trustedMs === null || !p.nameSeq) continue;
    const list = anchors.get(p.nameSeq.family) ?? [];
    list.push({ seq: p.nameSeq.seq, ms: p.trustedMs });
    anchors.set(p.nameSeq.family, list);
  }
  for (const list of anchors.values()) list.sort((a, b) => a.seq - b.seq);

  // Anchor-less families still deserve filename order: sequence them one
  // second apart from the earliest mtime the cluster carries.
  const orphanBase = new Map<string, { seqs: number[]; baseMs: number }>();
  for (const p of parsed) {
    if (p.trustedMs !== null || !p.nameSeq || anchors.has(p.nameSeq.family)) continue;
    if (!p.lastModified) continue;
    const entry = orphanBase.get(p.nameSeq.family) ?? { seqs: [], baseMs: Infinity };
    entry.seqs.push(p.nameSeq.seq);
    entry.baseMs = Math.min(entry.baseMs, p.lastModified);
    orphanBase.set(p.nameSeq.family, entry);
  }
  for (const entry of orphanBase.values()) entry.seqs.sort((a, b) => a - b);

  return parsed.map((p) => {
    if (p.trustedMs !== null) return toISO(p.trustedMs);
    if (!p.nameSeq) return null;
    const { family, seq } = p.nameSeq;

    const list = anchors.get(family);
    if (list?.length) {
      const below = [...list].reverse().find((a) => a.seq <= seq);
      const above = list.find((a) => a.seq >= seq);
      if (below && above) {
        if (above.seq === below.seq) return toISO(below.ms); // Live Photo pair
        const fraction = (seq - below.seq) / (above.seq - below.seq);
        // Clocks can disagree across 7 devices; never interpolate backwards.
        const ms = above.ms >= below.ms
          ? below.ms + (above.ms - below.ms) * fraction
          : below.ms;
        return toISO(ms);
      }
      // Outside the anchor range: extrapolate one second per shot.
      if (below) return toISO(below.ms + (seq - below.seq) * 1000);
      if (above) return toISO(above.ms - (above.seq - seq) * 1000);
    }

    const orphan = orphanBase.get(family);
    if (orphan && orphan.seqs.length >= 2) {
      return toISO(orphan.baseMs + orphan.seqs.indexOf(seq) * 1000);
    }
    return null;
  });
}

const primedBatches = new WeakMap<File, Promise<string | null>>();

/**
 * Register a freshly selected batch so `extractCaptureTime` can use
 * batch-level inference. Call this with the ORIGINAL File objects at the
 * moment they're added — before conversion/compression touches them.
 * Files already primed (e.g. a form delegating to a bulk queue) are skipped,
 * so double-priming along a delegation chain is harmless.
 */
export function primeBatchCaptureTimes(files: File[]): void {
  const fresh = files.filter((f) => !primedBatches.has(f));
  if (fresh.length < 2) return; // solo files take the direct path

  const batch = Promise.all(
    fresh.map(async (file) => ({
      name: file.name,
      exifISO: await extractExifISO(file),
      lastModified: file.lastModified || null,
    }))
  ).then((signals) => inferBatchCaptureTimes(signals));

  fresh.forEach((file, i) => {
    primedBatches.set(
      file,
      batch.then((times) => times[i])
    );
  });
}
