import { describe, expect, it } from "vitest";
import { telHref, telegramHref, whatsappHref, zaloHref } from "./contact-links";

describe("zaloHref", () => {
  it("uses the domestic leading 0, even when given 84", () => {
    expect(zaloHref("0369169913")).toBe("https://zalo.me/0369169913");
    expect(zaloHref("+84 369 169 913")).toBe("https://zalo.me/0369169913");
    expect(zaloHref("84369169913")).toBe("https://zalo.me/0369169913");
    expect(zaloHref("https://zalo.me/0369169913")).toBe(
      "https://zalo.me/0369169913",
    );
  });
  it("hides empty values", () => {
    expect(zaloHref("")).toBeNull();
    expect(zaloHref("   ")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("builds wa.me in international form", () => {
    expect(whatsappHref("+15148653435")).toBe("https://wa.me/15148653435");
    expect(whatsappHref("https://wa.me/15148653435")).toBe(
      "https://wa.me/15148653435",
    );
    expect(whatsappHref("0369169913")).toBe("https://wa.me/84369169913");
  });
});

describe("telegramHref", () => {
  it("accepts @handles and t.me URLs", () => {
    expect(telegramHref("@yanlovez")).toBe("https://t.me/yanlovez");
    expect(telegramHref("yanlovez")).toBe("https://t.me/yanlovez");
    expect(telegramHref("https://t.me/yanlovez")).toBe("https://t.me/yanlovez");
  });
  it("rejects junk", () => {
    expect(telegramHref("ab")).toBeNull();
    expect(telegramHref("not a handle!")).toBeNull();
  });
});

describe("telHref", () => {
  it("builds tel: links", () => {
    expect(telHref("+1 514 865 3435")).toBe("tel:+15148653435");
  });
  it("hides empty values", () => {
    expect(telHref("")).toBeNull();
  });
});
