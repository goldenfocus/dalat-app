import { describe, expect, it } from "vitest";
import {
  FLYER_MAX_BYTES,
  flyerExtension,
  hasValidFlyerSignature,
  safeFlyerLabel,
  validateFlyerMetadata,
} from "./flyer-suggestion";
import { sanitizeFlyerImage } from "./flyer-suggestion.server";

describe("flyer suggestion validation", () => {
  it("accepts the supported image formats within the upload limit", () => {
    expect(validateFlyerMetadata({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateFlyerMetadata({ type: "image/png", size: FLYER_MAX_BYTES })).toBeNull();
    expect(validateFlyerMetadata({ type: "image/webp", size: 2048 })).toBeNull();
  });

  it("rejects empty, unsupported, and oversized files", () => {
    expect(validateFlyerMetadata({ type: "image/jpeg", size: 0 })).toBe("invalid_flyer");
    expect(validateFlyerMetadata({ type: "image/gif", size: 1024 })).toBe("invalid_flyer");
    expect(validateFlyerMetadata({ type: "image/png", size: FLYER_MAX_BYTES + 1 })).toBe(
      "flyer_too_large"
    );
  });

  it("checks magic bytes instead of trusting the declared MIME type", () => {
    expect(hasValidFlyerSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
    expect(
      hasValidFlyerSignature(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        "image/png"
      )
    ).toBe(true);
    expect(
      hasValidFlyerSignature(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
        "image/webp"
      )
    ).toBe(true);
    expect(hasValidFlyerSignature(new TextEncoder().encode("not an image"), "image/png")).toBe(false);
  });

  it("creates safe labels and deterministic extensions", () => {
    expect(safeFlyerLabel("  Flower\nNight.png  ")).toBe("Flower Night.png");
    expect(flyerExtension("image/jpeg")).toBe("jpg");
    expect(flyerExtension("image/png")).toBe("png");
    expect(flyerExtension("image/webp")).toBe("webp");
  });

  it("decodes and re-encodes real images while rejecting signature-only payloads", async () => {
    const validPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const signatureOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const sanitized = await sanitizeFlyerImage(validPng, "image/png");

    expect(sanitized).toBeInstanceOf(Buffer);
    expect(hasValidFlyerSignature(sanitized!, "image/png")).toBe(true);
    expect(await sanitizeFlyerImage(signatureOnly, "image/png")).toBeNull();
  });
});
