import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("exifr", () => ({ default: { gps: vi.fn(), parse: vi.fn() } }));
import exifr from "exifr";
import { photoContext } from "./photo-context";
beforeEach(() => vi.clearAllMocks());
describe("private photo hints", () => {
  it("keeps valid contributor coordinates and original date as optional hints", async () => {
    vi.mocked(exifr.gps).mockResolvedValue({
      latitude: 11.94,
      longitude: 108.44,
    });
    vi.mocked(exifr.parse).mockResolvedValue({
      DateTimeOriginal: "2026:09:12 13:00:00",
    });
    expect(await photoContext(new Uint8Array())).toEqual({
      gps: { latitude: 11.94, longitude: 108.44 },
      date: "2026-09-12",
    });
  });
  it("rejects impossible coordinates and dates", async () => {
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: 91, longitude: 108 });
    vi.mocked(exifr.parse).mockResolvedValue({
      DateTimeOriginal: "2026:02:30 13:00:00",
    });
    expect(await photoContext(new Uint8Array())).toEqual({
      gps: null,
      date: null,
    });
  });
  it("missing or malformed metadata never blocks contribution", async () => {
    vi.mocked(exifr.gps).mockRejectedValue(new Error("no metadata"));
    expect(await photoContext(new Uint8Array())).toEqual({
      gps: null,
      date: null,
    });
  });
});
