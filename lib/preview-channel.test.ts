// @vitest-environment node
import { describe, expect, it } from "vitest";
import { retiredPreviewTarget } from "./preview-channel";

describe("retired preview links", () => {
  it.each([
    ["/v3", "/"],
    ["/v3/", "/"],
    ["/v3/calendar", "/calendar"],
    ["/vi/v3", "/vi"],
    ["/vi/v3/", "/vi"],
    ["/vi/v4/events/tea", "/vi/events/tea"],
  ])("maps %s to %s", (path, expected) => {
    expect(retiredPreviewTarget(path)).toBe(expected);
  });

  it.each(["/", "/calendar", "/vi", "/v10/x", "/v3x", "/vanessa", "/xx/v3", "/events/v3"])(
    "leaves %s alone",
    (path) => expect(retiredPreviewTarget(path)).toBeNull(),
  );
});
