import type { ImportOptions } from "@/lib/import/import-events";
import { COMMUNITY_SUGGESTION_SOURCE } from "@/lib/events/event-suggestion";

interface QueuePolicyRow {
  id: string;
  source: string;
  payload: {
    submittedBy?: string;
    submittedAt?: string;
  };
}

/**
 * Queue provenance controls publication policy. Community suggestions can
 * only become reviewable drafts, even when trusted automated imports are
 * configured to auto-publish.
 */
export function getQueueImportOptions(
  row: QueuePolicyRow,
  createdBy: string
): ImportOptions {
  if (row.source === "canary") {
    return { status: "draft", sourcePlatform: "canary", createdBy };
  }

  if (row.source === COMMUNITY_SUGGESTION_SOURCE) {
    return {
      status: "draft",
      sourcePlatform: COMMUNITY_SUGGESTION_SOURCE,
      sourceMetadata: {
        suggestion_queue_id: row.id,
        suggested_by: row.payload.submittedBy ?? null,
        suggested_at: row.payload.submittedAt ?? null,
        review_status: "pending",
      },
      createdBy,
    };
  }

  return { createdBy };
}
