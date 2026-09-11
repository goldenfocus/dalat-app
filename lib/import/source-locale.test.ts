import { describe, expect, it } from "vitest";
import {
  asContentLocale,
  inferSourceLocale,
  resolveStoredSourceLocale,
} from "./source-locale";

describe("inferSourceLocale", () => {
  it("recognizes Vietnamese-unique letters without calling a model", () => {
    expect(
      inferSourceLocale("Hà Nhi live in Dalat tại La Maritza", "Đêm nhạc tại Đà Lạt"),
    ).toBe("vi");
  });

  it("does not guess Latin-only copy (worker detectLanguage later)", () => {
    expect(inferSourceLocale("Sunset hike Langbiang", "19:00 at Langbiang, Da Lat.")).toBe(
      null,
    );
  });

  it("does not treat a Đà Lạt place name as Vietnamese source copy", () => {
    expect(
      inferSourceLocale("Sunset hike Langbiang", "19:00 at Langbiang, Đà Lạt."),
    ).toBeNull();
  });

  it("recognizes Hangul / Han / Cyrillic / Thai even when Đà Lạt is mentioned", () => {
    expect(inferSourceLocale("달랏 라이브 in Đà Lạt")).toBe("ko");
    expect(inferSourceLocale("大叻现场")).toBe("zh");
    expect(inferSourceLocale("Концерт в Далате")).toBe("ru");
    expect(inferSourceLocale("คอนเสิร์ตที่ดาลัด")).toBe("th");
  });
});

describe("resolveStoredSourceLocale", () => {
  it("keeps a valid stored locale over the script hint", () => {
    expect(resolveStoredSourceLocale("en", "Đêm nhạc tại Đà Lạt")).toBe("en");
  });

  it("rejects junk stored values and falls back to the script hint", () => {
    expect(resolveStoredSourceLocale("xx", "Đêm nhạc tại Đà Lạt")).toBe("vi");
    expect(asContentLocale("EN")).toBe("en");
    expect(asContentLocale("nope")).toBeNull();
  });
});
