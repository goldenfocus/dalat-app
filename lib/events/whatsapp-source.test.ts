import { describe, expect, it } from "vitest";
import { getWhatsAppCommunityUrl, isWhatsAppSourced } from "./whatsapp-source";

describe("whatsapp source credit", () => {
  it("detects WhatsApp-sourced events", () => {
    expect(isWhatsAppSourced("whatsapp")).toBe(true);
    expect(isWhatsAppSourced("activity-graph")).toBe(false);
    expect(isWhatsAppSourced(null)).toBe(false);
  });

  it("accepts a plain chat.whatsapp.com invite link", () => {
    expect(getWhatsAppCommunityUrl("https://chat.whatsapp.com/AbCdEf1234567890xyz")).toBe(
      "https://chat.whatsapp.com/AbCdEf1234567890xyz",
    );
    expect(getWhatsAppCommunityUrl(" https://chat.whatsapp.com/AbCdEf1234567890xyz/?ref=1 ")).toBe(
      "https://chat.whatsapp.com/AbCdEf1234567890xyz",
    );
  });

  it("returns null for missing or unexpected URLs", () => {
    expect(getWhatsAppCommunityUrl(undefined)).toBeNull();
    expect(getWhatsAppCommunityUrl("")).toBeNull();
    expect(getWhatsAppCommunityUrl("not a url")).toBeNull();
    expect(getWhatsAppCommunityUrl("http://chat.whatsapp.com/AbCdEf1234567890xyz")).toBeNull();
    expect(getWhatsAppCommunityUrl("https://evil.example/AbCdEf1234567890xyz")).toBeNull();
    expect(getWhatsAppCommunityUrl("whatsapp:120363401591221909@g.us/ABC")).toBeNull();
    expect(getWhatsAppCommunityUrl("https://wa.me/84123456789")).toBeNull();
  });
});
