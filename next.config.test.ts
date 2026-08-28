import { describe, expect, it } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import nextConfig from "./next.config";

const images = nextConfig.images ?? {};
const domains = images.domains ?? [];
const remotePatterns = images.remotePatterns ?? [];

describe("Next.js image sources", () => {
  it("allows thumbnails from the DaLat.app Cloudflare Stream account", () => {
    const thumbnail = new URL(
      "https://customer-9g4uycudmu3mklbc.cloudflarestream.com/d84c4314380975c6faf6877ffe77e728/thumbnails/thumbnail.jpg"
    );
    const resizedThumbnail = new URL(thumbnail);
    resizedThumbnail.searchParams.set("width", "480");

    expect(hasRemoteMatch(domains, remotePatterns, thumbnail)).toBe(true);
    expect(hasRemoteMatch(domains, remotePatterns, resizedThumbnail)).toBe(true);
  });

  it("does not allow non-thumbnail Stream resources through the image optimizer", () => {
    const manifest = new URL(
      "https://customer-9g4uycudmu3mklbc.cloudflarestream.com/d84c4314380975c6faf6877ffe77e728/manifest/video.m3u8"
    );

    expect(hasRemoteMatch(domains, remotePatterns, manifest)).toBe(false);
  });
});
