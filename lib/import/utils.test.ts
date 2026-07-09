import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({ upload: uploadMock })),
}));

import { downloadAndUploadImage } from "./utils";
import { getStorageProvider } from "@/lib/storage";

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
