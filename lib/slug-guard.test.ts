import { describe, expect, it } from "vitest";
import { isUnroutableUnifiedSlug, isUuid } from "./slug-guard";

describe("isUnroutableUnifiedSlug", () => {
  it("rejects fall-through API paths and file-like slugs", () => {
    expect(isUnroutableUnifiedSlug("api", "inngest")).toBe(true);
    expect(isUnroutableUnifiedSlug("zh", "manifest.json")).toBe(true);
    expect(isUnroutableUnifiedSlug("en", "wp-login.php")).toBe(true);
  });

  it("keeps real profile, venue, and organizer slugs", () => {
    expect(isUnroutableUnifiedSlug("en", "may-lang-thang")).toBe(false);
    expect(isUnroutableUnifiedSlug("vi", "giang_metta")).toBe(false);
  });
});

describe("isUuid", () => {
  it("only accepts canonical UUIDs", () => {
    expect(isUuid("a340582a-52b9-4929-9275-b7340babf50e")).toBe(true);
    expect(isUuid("inngest")).toBe(false);
    expect(isUuid("manifest.json")).toBe(false);
  });
});
