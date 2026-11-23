import { describe, expect, it } from "vitest";
import { normalizeEventContactLink } from "./contact-link";

describe("event contact links", () => {
  it.each([
    [" zalo.me/g/AbCdEf ", "https://zalo.me/g/AbCdEf"],
    ["chat.whatsapp.com/MiXeD", "https://chat.whatsapp.com/MiXeD"],
    ["https://example.com/Booking?code=UpPer", "https://example.com/Booking?code=UpPer"],
  ])("keeps invite codes and paths intact for %s", (input, expected) => {
    expect(normalizeEventContactLink(input)).toBe(expected);
  });

  it.each(["", "Zalo group", "javascript:alert(1)", "file:///example.com", "//example.com", "https://user@exam.ple"])("rejects %j", (input) => {
    expect(normalizeEventContactLink(input)).toBeNull();
  });
});
