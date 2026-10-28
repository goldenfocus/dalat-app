import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect } from "vitest";
import { TranslatedFrom } from "./translation-badge";
describe("original text access", () => {
  it("retains the exact source and disclosure when its language is outside the12 targets", () => {
    const original = "To jest oryginalny komentarz.\nKeep this line exact.";
    const { container } = render(
      <NextIntlClientProvider
        locale="de"
        messages={{
          translations: {
            showOriginal: "Original zeigen",
            translatedFrom: "Übersetzt aus",
          },
        }}
      >
        <TranslatedFrom sourceLocale={null} originalText={original} />
      </NextIntlClientProvider>,
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Original zeigen"));
    expect(details.open).toBe(true);
    expect(details.querySelector("div")?.textContent).toBe(original);
    expect(container.textContent).not.toContain("undefined");
  });
});
