import { describe, expect, it } from "vitest";
import {
  canonicalizeSourceUrl,
  isPersistedSourceRef,
  parsePublicHttpUrl,
  whatsappSourceRef,
} from "./safe-url";

describe("parsePublicHttpUrl", () => {
  it("accepts a public https URL", () => {
    expect(parsePublicHttpUrl("https://ticketbox.vn/event/hike")?.hostname).toBe(
      "ticketbox.vn",
    );
  });

  it.each([
    "http://127.0.0.1/event",
    "http://localhost/event",
    "http://10.0.0.2/event",
    "https://user:pass@example.com/event",
    "ftp://example.com/event",
    "not-a-url",
  ])("rejects %s", (input) => {
    expect(parsePublicHttpUrl(input)).toBeNull();
  });
});

describe("canonicalizeSourceUrl", () => {
  it("strips tracking params and trailing slashes", () => {
    expect(
      canonicalizeSourceUrl(
        "https://www.Facebook.com/events/123/?utm_source=ig&fbclid=abc",
      ),
    ).toBe("https://www.facebook.com/events/123");
  });
});

describe("whatsapp source refs", () => {
  it("stores a non-fetchable provenance identifier", () => {
    const ref = whatsappSourceRef("120363@g.us", "ABCD");
    expect(ref).toBe("whatsapp:120363@g.us/ABCD");
    expect(isPersistedSourceRef(ref)).toBe(true);
    expect(parsePublicHttpUrl(ref)).toBeNull();
  });
});
