import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { LanguageSetup } from "./language-setup";
import { DEFAULT_LANGUAGE_PREFERENCES, type LanguagePreferences } from "@/lib/arrival/languages";
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
afterEach(cleanup);
function Form({ initial = DEFAULT_LANGUAGE_PREFERENCES, disabled = false }: { initial?: LanguagePreferences; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  return <><LanguageSetup value={value} onChange={setValue} disabled={disabled} /><output data-testid="preferences">{JSON.stringify(value)}</output></>;
}
function preferences() { return JSON.parse(screen.getByTestId("preferences").textContent || "{}"); }
describe("reusable language setup", () => {
  it("shows the priority languages first in both pickers and excludes existing spoken languages", () => {
    render(<Form initial={{ speaks: [{ language: "en", level: "native" }], learning: { language: "vi", level: "new" } }} />);
    fireEvent.click(screen.getByRole("button", { name: "addLanguage" }));
    expect(within(screen.getByRole("group", { name: "addLanguage" })).getAllByRole("button").slice(0, 3).map(button => button.textContent)).toEqual(["Vietnamese", "French", "Spanish"]);
    fireEvent.click(screen.getByRole("button", { name: "French" }));
    expect(preferences().speaks.map((entry: { language: string }) => entry.language)).toEqual(["en", "fr"]);
    fireEvent.click(screen.getByRole("button", { name: "chooseLearning" }));
    expect(within(screen.getByRole("group", { name: "chooseLearning" })).getAllByRole("button").slice(0, 4).map(button => button.textContent)).toEqual(["English", "Vietnamese", "French", "Spanish"]);
  });
  it("starts with Vietnamese and lets guests change their practice level", () => {
    render(<Form />);
    expect(screen.getByText("Vietnamese")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "levels.beginner" }));
    expect(preferences().learning).toEqual({ language: "vi", level: "beginner" });
    expect(screen.queryByRole("button", { name: "levels.native" })).toBeNull();
  });
  it("searches and adds a spoken language, changes its level, and removes it", () => {
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "chooseSpoken" }));
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), { target: { value: "francais" } });
    fireEvent.click(screen.getByRole("button", { name: "French" }));
    expect(preferences().speaks).toEqual([{ language: "fr", level: "native" }]);
    fireEvent.click(screen.getAllByRole("button", { name: "levels.fluent" })[0]);
    expect(preferences().speaks[0].level).toBe("fluent");
    fireEvent.click(screen.getByRole("button", { name: "removeLanguage" }));
    expect(preferences().speaks).toEqual([]);
  });
  it("keeps all controls disabled while a parent submits", () => {
    render(<Form disabled initial={{ speaks: [{ language: "en", level: "native" }], learning: { language: "vi", level: "new" } }} />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });
});
