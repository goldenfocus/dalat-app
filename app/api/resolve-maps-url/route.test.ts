import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllGlobals());
describe("Google Maps short links", () => {
  it("resolves the real pin rather than the map camera without an API key", async () => {
    const fetch = vi.fn().mockResolvedValue({ url: "https://www.google.com/maps/place/Social/@11.99,108.49,19z/data=!3d11.9467648!4d108.4341887" });
    vi.stubGlobal("fetch", fetch);
    const response = await POST(new Request("https://dalat.app/api/resolve-maps-url", { method: "POST", body: JSON.stringify({ url: "https://maps.app.goo.gl/example" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ latitude: 11.9467648, longitude: 108.4341887 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a lookalike host without fetching it", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(new Request("https://dalat.app/api/resolve-maps-url", { method: "POST", body: JSON.stringify({ url: "https://example.com/maps.app.goo.gl/test" }) }));
    expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
});
