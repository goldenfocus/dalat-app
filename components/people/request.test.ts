import { afterEach, describe, expect, it, vi } from "vitest";
import { PeopleRequestError, requestPeople } from "./request";

afterEach(() => vi.unstubAllGlobals());

describe("People mutations", () => {
  it("sends an explicit same-origin JSON mutation", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetch);
    await expect(requestPeople("/api/people/block", "DELETE", { user_id: "u1" }))
      .resolves.toEqual({ success: true });
    expect(fetch).toHaveBeenCalledWith("/api/people/block", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ user_id: "u1" }),
      headers: { "Content-Type": "application/json" },
    }));
  });

  it("does not surface database error text or treat a failed save as success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "private database detail", code: "people_unavailable" }),
      { status: 503 },
    )));
    await expect(requestPeople("/api/people/profile", "POST", { enabled: true }))
      .rejects.toEqual(new PeopleRequestError("people_unavailable"));
  });

  it("handles a non-JSON error response without leaking its content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream failure", { status: 502 })));
    await expect(requestPeople("/api/people/profile", "PATCH", { enabled: false }))
      .rejects.toEqual(new PeopleRequestError("request_failed"));
  });
});
