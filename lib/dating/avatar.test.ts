import { describe, expect, it } from "vitest";
import { safeDatingAvatar } from "./avatar";
describe("dating avatar privacy", () => {
  it("allows first-party static image hosts", () => {
    expect(
      safeDatingAvatar("https://cdn.dalat.app/avatars/a.jpg"),
    ).toBeTruthy();
    expect(
      safeDatingAvatar(
        "https://aljcmodwjqlznzcydyor.supabase.co/storage/v1/object/public/avatars/a.jpg",
      ),
    ).toBeTruthy();
  });
  it.each([
    "https://tracker.example/face",
    "https://cdn.dalat.app.evil.test/a",
    "https://x@cdn.dalat.app/a",
    "http://cdn.dalat.app/a",
    "https://cdn.dalat.app:8080/a",
    "javascript:alert(1)",
    "https://aljcmodwjqlznzcydyor.supabase.co/functions/v1/tracker",
  ])("blocks %s", (src) => expect(safeDatingAvatar(src)).toBeNull());
});
