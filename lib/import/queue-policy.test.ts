import { describe, expect, it } from "vitest";
import { getQueueImportOptions } from "./queue-policy";

describe("getQueueImportOptions", () => {
  it("keeps synthetic canaries private", () => {
    expect(
      getQueueImportOptions(
        {
          id: "queue-123",
          source: "canary",
          payload: {},
        },
        "system-user",
      ),
    ).toEqual({
      status: "draft",
      sourcePlatform: "canary",
      createdBy: "system-user",
    });
  });

  it("rejects every real legacy queue source", () => {
    expect(() =>
      getQueueImportOptions(
        { id: "queue-789", source: "dalat-gov", payload: {} },
        "system-user",
      ),
    ).toThrow("Legacy event import queue is retired");
  });
});
