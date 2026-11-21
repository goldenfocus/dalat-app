import { beforeEach, describe, expect, it, vi } from "vitest";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ storage: { from: () => ({ download }) } }),
}));

import { GET } from "./route";

const owner = "cdf6e357-500d-437c-8082-61c1205510fb";
const file = "9ba6289f-7c62-4a73-aad7-377ed446b2a8.webp";
const request = new Request("https://dalat.app/api/rentals/photos/" + owner + "/" + file);
const context = (name = file) => ({ params: Promise.resolve({ owner, file: name }) });

beforeEach(() => { download.mockReset(); });

describe("rental photo response caching", () => {
  it("does not cache an invalid photo path", async () => {
    const response = await GET(request, context("invalid.webp"));
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(download).not.toHaveBeenCalled();
  });

  it("does not cache a photo that exists after a listing is published", async () => {
    download.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: new Blob(["photo"]) });
    const missing = await GET(request, context());
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("private, no-store");
    const published = await GET(request, context());
    expect(published.status).toBe(200);
    expect(published.headers.get("Cache-Control")).toBe("private, no-store");
    expect(published.headers.get("Content-Type")).toBe("image/webp");
  });
});
