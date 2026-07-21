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
 * Best-effort capture time for a file, as an ISO string suitable for a
 * `timestamptz` column. Returns null when nothing trustworthy is available —
 * never a synthesised "now", which would be indistinguishable from upload time
 * and would defeat the whole point.
 *
 * @param file - the ORIGINAL File, straight from the picker
 */
export async function extractCaptureTime(file: File): Promise<string | null> {
  // Video: capture time lives in the QuickTime `com.apple.quicktime.creationdate`
  // atom, which exifr doesn't read. `lastModified` is the safe signal here —
  // notably safer than the MOV `CreateDate` atom, which is UTC and would land
  // every video 7 hours early.
  if (file.type.startsWith("video/")) {
    return lastModifiedToISO(file);
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

  return lastModifiedToISO(file);
}
