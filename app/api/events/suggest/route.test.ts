import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("retired event suggestion endpoint", () => {
  it.each([
    ["application/json", JSON.stringify({ url: "https://example.com/event" })],
    ["multipart/form-data; boundary=retired", "--retired--"],
  ])("returns a side-effect-free 410 for %s", async (contentType, body) => {
    const response = await POST(
      new Request("http://localhost/api/events/suggest", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      code: "suggestions_retired",
      message: "Activity discovery is automatic; there is no approval queue.",
    });
  });
});
