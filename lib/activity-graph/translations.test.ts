import { describe, expect, it } from "vitest";
import { sourceDescriptionForLocale } from "./translations";

describe("sourceDescriptionForLocale", () => {
  it("uses the requested supported locale", () => {
    expect(sourceDescriptionForLocale("en", "Dưới Tán Anh Đào")).toContain(
      "Official activity listing",
    );
    expect(sourceDescriptionForLocale("vi", "Dưới Tán Anh Đào")).toContain(
      "Thông tin hoạt động chính thức",
    );
  });

  it("falls back to English for an unknown locale", () => {
    expect(sourceDescriptionForLocale("unknown", "Official Source")).toContain(
      "Official activity listing",
    );
  });
});
