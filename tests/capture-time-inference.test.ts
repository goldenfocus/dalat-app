import { describe, it, expect } from "vitest";
import { inferBatchCaptureTimes, type CaptureSignal } from "@/lib/exif-capture-time";

// All scenarios replay the AI Round Table incident (Jul 22 2026): a batch
// transferred via AirDrop/Zalo arrives with EXIF stripped from videos (always)
// and some photos, and `lastModified` rewritten to the transfer moment — so
// ~25 files claimed to be "captured" inside one 44-second window and piled up
// at the start of the gallery in random order. iPhone filenames (IMG_8306…)
// are the one shoot-order signal that survives every transfer.

const NOW = Date.parse("2026-07-22T13:00:00Z");
const T = (iso: string) => Date.parse(iso);

function photo(name: string, exifISO: string | null, lastModified: number): CaptureSignal {
  return { name, exifISO, lastModified };
}

describe("inferBatchCaptureTimes", () => {
  it("interpolates a transferred video between its filename neighbors", () => {
    // Photos kept EXIF (anchors); the video's lastModified is the batch
    // transfer moment, shared with nothing else real.
    const transferAt = T("2026-07-22T10:17:40Z");
    const batch: CaptureSignal[] = [
      photo("IMG_8311.JPG", "2026-07-22T04:30:00.000Z", transferAt),
      photo("IMG_8312.MOV", null, transferAt),
      photo("IMG_8312 2.MOV", null, transferAt + 1000), // decoy for cluster detection
      photo("IMG_8314.MOV", null, transferAt + 2000),
      photo("IMG_8313.JPG", "2026-07-22T04:40:00.000Z", transferAt),
    ];
    const times = batch.map((s) => s); // keep order readable
    const result = inferBatchCaptureTimes(times, NOW);

    // IMG_8312 sits a third of the way between 8311 (04:30) and 8313 (04:40)...
    // linear by sequence: (8312-8311)/(8313-8311) = 0.5 → 04:35
    expect(result[0]).toBe("2026-07-22T04:30:00.000Z"); // EXIF untouched
    expect(result[4]).toBe("2026-07-22T04:40:00.000Z"); // EXIF untouched
    expect(result[1]).toBe("2026-07-22T04:35:00.000Z"); // interpolated
    // 8314 is past the last anchor → extrapolated 1s per sequence step
    expect(result[3]).toBe("2026-07-22T04:40:01.000Z");
    // sort order must follow filename sequence
    const order = [result[0], result[1], result[4], result[3]].map((t) => T(t!));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps real lastModified for direct camera-roll picks (no cluster)", () => {
    // Videos picked straight from the camera roll carry their true creation
    // time in lastModified, spread across the event — trust them.
    const batch: CaptureSignal[] = [
      photo("IMG_9001.MOV", null, T("2026-07-22T04:10:00Z")),
      photo("IMG_9005.MOV", null, T("2026-07-22T04:50:00Z")),
      photo("IMG_9009.MOV", null, T("2026-07-22T05:30:00Z")),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    expect(result).toEqual([
      "2026-07-22T04:10:00.000Z",
      "2026-07-22T04:50:00.000Z",
      "2026-07-22T05:30:00.000Z",
    ]);
  });

  it("orders an anchor-less transferred batch by filename sequence", () => {
    // Whole batch came through Zalo: EXIF gone everywhere, lastModified all
    // within seconds. No anchors — but filename order is still shoot order.
    const base = T("2026-07-22T10:17:32Z");
    const batch: CaptureSignal[] = [
      photo("IMG_8320.JPG", null, base + 20_000),
      photo("IMG_8306.JPG", null, base),
      photo("IMG_8313.JPG", null, base + 40_000),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    expect(result.every(Boolean)).toBe(true);
    const [t8320, t8306, t8313] = result.map((t) => T(t!));
    expect(t8306).toBeLessThan(t8313);
    expect(t8313).toBeLessThan(t8320);
  });

  it("returns null for clustered files with no usable filename sequence", () => {
    const base = T("2026-07-22T10:17:32Z");
    const batch: CaptureSignal[] = [
      photo("photo.jpg", null, base),
      photo("clip.mov", null, base + 5_000),
      photo("export.png", null, base + 9_000),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    expect(result).toEqual([null, null, null]);
  });

  it("distrusts lastModified stamped moments ago (picker re-export)", () => {
    // iOS pickers re-export assets and stamp lastModified with selection time.
    const batch: CaptureSignal[] = [
      photo("IMG_7001.JPG", "2026-07-22T04:00:00.000Z", NOW - 30_000),
      photo("IMG_7002.MOV", null, NOW - 20_000),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    expect(result[0]).toBe("2026-07-22T04:00:00.000Z");
    // one step past the only anchor, not "just now"
    expect(result[1]).toBe("2026-07-22T04:00:01.000Z");
  });

  it("gives a Live Photo companion its photo's exact time", () => {
    const transferAt = T("2026-07-22T10:17:40Z");
    const batch: CaptureSignal[] = [
      photo("IMG_8306.HEIC", "2026-07-22T04:12:00.000Z", transferAt),
      photo("IMG_8306.MOV", null, transferAt),
      photo("IMG_8307.MOV", null, transferAt + 1000),
      photo("IMG_8308.MOV", null, transferAt + 2000),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    expect(result[1]).toBe("2026-07-22T04:12:00.000Z");
  });

  it("never lets filename families cross-contaminate", () => {
    // A screenshot named with a date must not anchor IMG_ files.
    const base = T("2026-07-22T10:17:32Z");
    const batch: CaptureSignal[] = [
      photo("Shot 2026-07-22 at 08.08.35.png", "2026-07-22T01:08:35.000Z", base),
      photo("IMG_8306.JPG", null, base + 1_000),
      photo("IMG_8307.JPG", null, base + 2_000),
      photo("IMG_8308.JPG", null, base + 3_000),
    ];
    const result = inferBatchCaptureTimes(batch, NOW);
    // IMG files have no IMG-family anchor → ordered among themselves from the
    // cluster base, NOT interpolated against the screenshot's time.
    const imgTimes = result.slice(1).map((t) => T(t!));
    expect(imgTimes[0]).toBeLessThan(imgTimes[1]);
    expect(imgTimes[1]).toBeLessThan(imgTimes[2]);
  });
});
