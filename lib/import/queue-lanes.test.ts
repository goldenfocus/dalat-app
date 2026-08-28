import { describe, expect, it } from "vitest";
import { AUTO_IMPORT_QUEUE_TYPES } from "./queue-lanes";

describe("import queue lanes", () => {
  it("retains only the historical structured queue shapes", () => {
    expect(AUTO_IMPORT_QUEUE_TYPES).toEqual(["url", "text"]);
  });
});
