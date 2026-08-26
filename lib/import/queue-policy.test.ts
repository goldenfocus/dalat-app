import { describe, expect, it } from "vitest";
import { getQueueImportOptions } from "./queue-policy";

describe("getQueueImportOptions", () => {
  it("forces community suggestions to draft with review provenance", () => {
    expect(
      getQueueImportOptions(
        {
          id: "queue-123",
          source: "community-suggestion",
          payload: { submittedBy: "user-456", submittedAt: "2026-08-25T12:00:00Z" },
        },
        "system-user"
      )
    ).toEqual({
      status: "draft",
      sourcePlatform: "community-suggestion",
      sourceMetadata: {
        suggestion_queue_id: "queue-123",
        suggested_by: "user-456",
        suggested_at: "2026-08-25T12:00:00Z",
        review_status: "pending",
      },
      createdBy: "system-user",
    });
  });

  it("leaves trusted imports on the global import policy", () => {
    expect(
      getQueueImportOptions(
        { id: "queue-789", source: "dalat-gov", payload: {} },
        "system-user"
      )
    ).toEqual({ createdBy: "system-user" });
  });
});
