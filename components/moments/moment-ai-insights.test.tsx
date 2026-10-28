import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentAiInsights } from "./moment-ai-insights";
import { metadataLabels } from "@/lib/translations/metadata-labels";
const mocks = vi.hoisted(() => ({ query: vi.fn(), filters: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: (key: string, value: string) => {
          mocks.filters(key, value);
          return builder;
        },
        maybeSingle: () => mocks.query(),
      };
      return builder;
    },
  }),
}));
vi.mock("@/components/ui/translated-content", () => ({
  TranslatedContent: ({ original }: { original: string }) => (
    <span>{original}</span>
  ),
}));
const source = {
  ai_tags: ["  coffee  ", "community"],
  detected_objects: ["table"],
  location_hints: ["Đà Lạt"],
  mood: "cozy",
  detected_text: ["OPEN", "7:00"],
};
const translated = [
  "Kaffee",
  "Gemeinschaft",
  "Tisch",
  "Đà Lạt",
  "gemütlich",
  "GEÖFFNET",
  "7:00",
];
const view = (id = "moment-id", locale = "de") => (
  <NextIntlClientProvider
    locale={locale}
    messages={{
      moments: { aiInsights: "KI-Einblicke", detectedText: "Erkannter Text" },
      translations: { showOriginal: "Original anzeigen" },
    }}
  >
    <MomentAiInsights
      momentId={id}
      aiDescription={null}
      sceneDescription={null}
      aiTags={source.ai_tags}
      detectedObjects={source.detected_objects}
      locationHints={source.location_hints}
      mood={source.mood}
      detectedText={source.detected_text}
      dominantColors={["#fff"]}
      videoSummary={null}
      audioSummary={null}
      pdfSummary={null}
      contentType="photo"
    />
  </NextIntlClientProvider>
);
beforeEach(() =>
  mocks.query.mockResolvedValue({
    data: { translated_text: JSON.stringify(translated) },
    error: null,
  }),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("localized AI metadata labels", () => {
  it("maps ordered labels into their proper groups and discloses all exact sources once", async () => {
    const before = JSON.stringify(source);
    const { container } = render(view());
    expect(await screen.findByText("Kaffee")).toBeTruthy();
    expect(screen.getByText("Tisch")).toBeTruthy();
    expect(screen.getByText("gemütlich")).toBeTruthy();
    expect(screen.getByText("“GEÖFFNET”")).toBeTruthy();
    expect(mocks.filters).toHaveBeenCalledWith("content_id", "moment-id");
    expect(mocks.filters).toHaveBeenCalledWith("target_locale", "de");
    expect(mocks.filters).toHaveBeenCalledWith("field_name", "tags");
    expect(screen.getByTitle("#fff")).toBeTruthy();
    const outer = container.querySelector("details")!;
    fireEvent.click(screen.getByText("KI-Einblicke"));
    expect(outer.open).toBe(true);
    const original = outer.querySelector("details")!;
    expect(container.querySelectorAll("details details")).toHaveLength(1);
    expect(original.querySelector("div")?.textContent).toBe(
      metadataLabels(source).join("\n"),
    );
    expect(original.closest("a")).toBeNull();
    fireEvent.click(screen.getByText("Original anzeigen"));
    expect(original.open).toBe(true);
    fireEvent.click(screen.getByText("Original anzeigen"));
    expect(original.open).toBe(false);
    expect(outer.open).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    "not JSON",
    JSON.stringify(["Only one"]),
    JSON.stringify([null, ...translated.slice(1)]),
    JSON.stringify([" ", ...translated.slice(1)]),
  ])("keeps source labels for invalid composite reply %s", async (reply) => {
    mocks.query.mockResolvedValue({
      data: { translated_text: reply },
      error: null,
    });
    const { container } = render(view());
    await waitFor(() => expect(mocks.query).toHaveBeenCalled());
    expect(screen.getByText("coffee")).toBeTruthy();
    expect(screen.getByText("cozy")).toBeTruthy();
    expect(screen.queryByText("Kaffee")).toBeNull();
    expect(container.querySelector("details details")).toBeNull();
  });
  it("ignores a late result after changing moment and locale", async () => {
    let finish: (result: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    mocks.query
      .mockImplementationOnce(() => pending)
      .mockResolvedValueOnce({
        data: {
          translated_text: JSON.stringify([
            "Coffee",
            "Community",
            "Table",
            "Đà Lạt",
            "Cozy",
            "Open",
            "7:00",
          ]),
        },
        error: null,
      });
    const { rerender } = render(view("first", "de"));
    rerender(view("second", "en"));
    expect(await screen.findByText("Coffee")).toBeTruthy();
    await act(async () => {
      finish({
        data: { translated_text: JSON.stringify(translated) },
        error: null,
      });
      await pending;
    });
    expect(screen.getByText("Coffee")).toBeTruthy();
    expect(screen.queryByText("Kaffee")).toBeNull();
    expect(mocks.filters).toHaveBeenCalledWith("content_id", "second");
    expect(mocks.filters).toHaveBeenCalledWith("target_locale", "en");
  });
});
