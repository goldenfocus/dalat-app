import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({ upload: uploadMock })),
}));

import { downloadAndUploadImage, parseEventDate } from "./utils";
import { getStorageProvider } from "@/lib/storage";

describe("parseEventDate", () => {
  it("parses Vietnamese DD/MM/YYYY as day-first in ICT", () => {
    // 25/07/2026 must be July 25 (midnight ICT = 17:00 previous day UTC),
    // NOT MM/DD (which would silently publish a wrong-month event)
    expect(parseEventDate("25/07/2026")).toBe("2026-07-24T17:00:00.000Z");
  });

  it("parses DD/MM/YYYY with a time in ICT", () => {
    expect(parseEventDate("25/07/2026", "19:30")).toBe(
      "2026-07-25T12:30:00.000Z"
    );
  });

  it("parses single-digit day/month", () => {
    expect(parseEventDate("5/7/2026", "08:00")).toBe(
      "2026-07-05T01:00:00.000Z"
    );
  });

  it("passes through ISO datetimes with timezone unchanged", () => {
    expect(parseEventDate("2026-07-25T19:30:00+07:00")).toBe(
      "2026-07-25T12:30:00.000Z"
    );
  });

  it("combines ISO date with a separate time", () => {
    expect(parseEventDate("2026-07-25", "19:30")).not.toBeNull();
  });

  it("returns null for garbage instead of guessing", () => {
    expect(parseEventDate("next Friday maybe")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseEventDate()).toBeNull();
    expect(parseEventDate("")).toBeNull();
  });
});

describe("downloadAndUploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadMock.mockResolvedValue(
      "https://cdn.dalat.app/event-media/test-slug/123.jpg"
    );
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new ArrayBuffer(5000),
    }) as unknown as typeof fetch;
  });

  it("uploads via the R2 storage provider, not Supabase Storage", async () => {
    const url = await downloadAndUploadImage(
      "https://scontent.fbcdn.net/x.jpg",
      "test-slug"
    );
    expect(getStorageProvider).toHaveBeenCalledWith("event-media");
    expect(uploadMock).toHaveBeenCalled();
    expect(uploadMock.mock.calls[0][0]).toBe("event-media");
    expect(url).toBe("https://cdn.dalat.app/event-media/test-slug/123.jpg");
  });

  it("returns null when the download fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
    });
    const url = await downloadAndUploadImage("https://x/y.jpg", "test-slug");
    expect(url).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("returns null for tiny (likely error-page) responses", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new ArrayBuffer(10),
    });
    const url = await downloadAndUploadImage("https://x/y.jpg", "test-slug");
    expect(url).toBeNull();
  });
});
