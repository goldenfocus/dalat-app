import "server-only";
import exifr from "exifr";
import { z } from "zod";
export async function photoContext(bytes: Uint8Array) {
  try {
    const [gps, tags] = await Promise.all([
      exifr.gps(bytes),
      exifr.parse(bytes, { reviveValues: false, pick: ["DateTimeOriginal"] }),
    ]);
    const date = String(tags?.DateTimeOriginal || "").match(
      /^(\d{4}):(\d{2}):(\d{2})/,
    );
    const candidate = date ? `${date[1]}-${date[2]}-${date[3]}` : null;
    const validDate =
      candidate &&
      z.iso.date().safeParse(candidate).success &&
      candidate <= new Date().toISOString().slice(0, 10)
        ? candidate
        : null;
    return {
      gps:
        gps &&
        Number.isFinite(gps.latitude) &&
        Number.isFinite(gps.longitude) &&
        Math.abs(gps.latitude) <= 90 &&
        Math.abs(gps.longitude) <= 180
          ? gps
          : null,
      date: validDate,
    };
  } catch {
    return { gps: null, date: null };
  }
}
