import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedActivity } from "./types";
import { upsertActivityEventTranslations } from "./translations";
const translate = vi.hoisted(() => vi.fn());
const english = vi.hoisted(() => vi.fn());
vi.mock("@/lib/google-translate", () => ({ batchTranslateFields: translate, translateFieldsToLocale: english }));
it("publishes actual translated titles and descriptions without fabricating failed locale coverage", async () => {
  english.mockResolvedValue({ title: "Mid-Autumn Festival", description: "A celebration for children and visitors." });
  translate.mockResolvedValue({ translations: { en: { title: "Mid-Autumn Festival", description: "A celebration for children and visitors." }, vi: { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } } });
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const db = { from: () => ({ upsert }) } as unknown as SupabaseClient;
  await upsertActivityEventTranslations(db, ["event-1", "event-2"], { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } as ExtractedActivity, "Publisher");
  const rows = upsert.mock.calls[0][0];
  expect(rows).toHaveLength(8);
  expect(rows.find((r: { target_locale: string; field_name: string }) => r.target_locale === "en" && r.field_name === "title").translated_text).toBe("Mid-Autumn Festival");
  expect(rows.some((r: { target_locale: string }) => r.target_locale === "fr")).toBe(false);
  expect(english.mock.calls[0][0][1].text).toBe("Đêm hội dành cho thiếu nhi.");
  expect(translate.mock.calls[0][1]).toBe("en");
});
it("blocks publication when the English fallback is unavailable", async () => {
  english.mockResolvedValue({ title: "Mid-Autumn Festival" });
  translate.mockResolvedValue({ translations: { vi: { title: "Đêm hội Trung thu" } } });
  const upsert = vi.fn();
  const db = { from: () => ({ upsert }) } as unknown as SupabaseClient;
  await expect(upsertActivityEventTranslations(db, ["event-1"], { title: "Đêm hội Trung thu", description: "Đêm hội dành cho thiếu nhi." } as ExtractedActivity, "Publisher")).rejects.toThrow("English activity translation is incomplete");
  expect(upsert).not.toHaveBeenCalled();
});
