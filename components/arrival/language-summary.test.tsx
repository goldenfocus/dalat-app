import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageSummary } from "./language-summary";
vi.mock("next-intl", () => ({ useLocale: () => "vi", useTranslations: () => (key: string) => key }));
afterEach(cleanup);
it("shows localized language names and proficiency from the saved snapshot", () => {
  render(<LanguageSummary value={{ speaks: [{ language: "fr", level: "native" }, { language: "en", level: "fluent" }], learning: { language: "vi", level: "new" } }} />);
  expect(screen.getByText("Tiếng Pháp · levels.native; Tiếng Anh · levels.fluent")).toBeVisible();
  expect(screen.getByText("Tiếng Việt · levels.new")).toBeVisible();
});
