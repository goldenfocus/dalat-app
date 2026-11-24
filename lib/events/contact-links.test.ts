import { describe, expect, it } from "vitest";
import { detectEventLinkPlatform, normalizeAdditionalEventLinks, normalizeEventLinkNames, publicEventLinks } from "./contact-links";

describe("event contact links", () => {
 it("recognizes real platform domains without trusting lookalikes", () => {
  expect(detectEventLinkPlatform("zalo.me/g/abc")).toBe("zalo");
  expect(detectEventLinkPlatform("https://chat.whatsapp.com/abc")).toBe("whatsapp");
  expect(detectEventLinkPlatform("https://t.me/abc")).toBe("telegram");
  expect(detectEventLinkPlatform("https://zalo.me.evil.example/g/abc")).toBe("website");
  expect(detectEventLinkPlatform("https://evilzalo.me")).toBe("website");
 });
 it("keeps all distinct links in order, normalizes pasted bare domains and skips blank rows", () => {
  expect(normalizeAdditionalEventLinks([" ", "wa.me/84999", "https://wa.me/84999", "t.me/community"])).toEqual(["https://wa.me/84999", "https://t.me/community"]);
 });
 it("rejects unsafe links and malformed arrays", () => {
  for (const value of [["javascript:alert(1)"], ["https://user:secret@example.com"], [42], "https://example.com", Array(20).fill("https://example.com")]) {
    expect(() => normalizeAdditionalEventLinks(value)).toThrow();
  }
 });
 it("preserves old primary links and deduplicates extra links", () => {
  expect(publicEventLinks("https://zalo.me/g/a", ["https://zalo.me/g/a", "https://wa.me/84999"])).toEqual(["https://zalo.me/g/a", "https://wa.me/84999"]);
 });
 it("never exposes imported private message pointers while allowing explicit public links", () => {
  expect(publicEventLinks("https://chat.whatsapp.com/private-source", ["https://zalo.me/g/public"], true)).toEqual(["https://zalo.me/g/public"]);
  expect(publicEventLinks("whatsapp:123@g.us/abc", ["javascript:alert(1)", "https://t.me/public"])).toEqual(["https://t.me/public"]);
 });
});

describe("named community links", () => {
 it("preserves community names and normalizes their URL keys", () => {
   expect(normalizeEventLinkNames({"zalo.me/g/AbC": " English & Walking "})).toEqual({"https://zalo.me/g/AbC":"English & Walking"});
 });
 it("rejects malformed name maps and unsafe URL keys", () => {
   expect(() => normalizeEventLinkNames({"javascript:alert(1)":"test"})).toThrow();
   expect(() => normalizeEventLinkNames({"https://example.com":4})).toThrow();
   expect(() => normalizeEventLinkNames([])).toThrow();
 });
});
