import type { ImportOptions } from "@/lib/import/import-events";

interface QueuePolicyRow {
  id: string;
  source: string;
  payload: {
    submittedBy?: string;
    submittedAt?: string;
  };
}

/** The retired queue may process synthetic canaries only. */
export function getQueueImportOptions(
  row: QueuePolicyRow,
  createdBy: string,
): ImportOptions {
  if (row.source !== "canary") {
    throw new Error("Legacy event import queue is retired");
  }
  return { status: "draft", sourcePlatform: "canary", createdBy };
}
