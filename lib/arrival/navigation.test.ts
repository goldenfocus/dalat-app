import { describe, expect, it } from "vitest";
import { isArrivalWorkspacePath } from "./navigation";

describe("arrival workspace refresh protection", () => {
  it("protects localized and unlocalized guest/staff workspaces", () => {
    for (const path of ["/staff", "/vi/staff", "/events/event/arrive", "/vi/events/event/arrive/", "/fr/events/event/host"]) expect(isArrivalWorkspacePath(path)).toBe(true);
  });
  it("keeps ordinary event and venue pages refreshable", () => {
    for (const path of ["/events/event", "/venues/host", "/events/arrive", "/events/event/host/other"]) expect(isArrivalWorkspacePath(path)).toBe(false);
  });
  it("preserves a sample round during automatic PWA updates without protecting other practice pages", () => {
    for (const path of ["/practice/rehearsal", "/en/practice/rehearsal", "/vi/practice/rehearsal/"]) expect(isArrivalWorkspacePath(path)).toBe(true);
    for (const path of ["/practice", "/practice/rehearsal/other"]) expect(isArrivalWorkspacePath(path)).toBe(false);
  });
});
