// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mediaResponse } from "./media-response";
describe("Safari audio byte range responses", () => {
  const file = new Blob(["0123456789"]);
  it("answers Safari's initial two-byte probe", async () => {
    const r = mediaResponse(file, "audio/mp4", "bytes=0-1");
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-1/10");
    expect(r.headers.get("content-length")).toBe("2");
    expect(await r.text()).toBe("01");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });
  it("supports seeking, open ranges and suffixes", async () => {
    expect(await mediaResponse(file, "audio/mp4", "bytes=6-").text()).toBe(
      "6789",
    );
    expect(await mediaResponse(file, "audio/mp4", "bytes=-3").text()).toBe(
      "789",
    );
    expect(await mediaResponse(file, "audio/mp4", "bytes=8-99").text()).toBe(
      "89",
    );
  });
  it("rejects invalid and unsatisfiable ranges without disclosing bytes", () => {
    for (const range of [
      "bytes=10-",
      "bytes=5-2",
      "bytes=0-1,5-6",
      "bytes=-0",
      "bytes=-",
    ])
      expect(mediaResponse(file, "audio/mp4", range).status).toBe(416);
  });
  it("preserves a full original download", async () => {
    const r = mediaResponse(file, "audio/mp4", null, true);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("0123456789");
    expect(r.headers.get("content-disposition")).toBe("attachment");
  });
});
