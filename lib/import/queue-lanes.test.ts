import { describe, expect, it } from "vitest";
import {
  AUTO_IMPORT_QUEUE_TYPES,
  MANUAL_REVIEW_QUEUE_TYPE,
  isAutoImportQueueType,
} from "./queue-lanes";

describe("import queue lanes", () => {
  it("processes URL articles and text canaries without auto-importing flyers", () => {
    expect(AUTO_IMPORT_QUEUE_TYPES).toEqual(["url", "text"]);
    expect(MANUAL_REVIEW_QUEUE_TYPE).toBe("image");
    expect(isAutoImportQueueType("url")).toBe(true);
    expect(isAutoImportQueueType("text")).toBe(true);
    expect(isAutoImportQueueType(MANUAL_REVIEW_QUEUE_TYPE)).toBe(false);
  });
});
