import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoreFromOrganizer } from "./more-from-organizer";
import { MoreAtVenue } from "./more-at-venue";
import type { Organizer } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  rows: [] as Record<string, unknown>[],
  format: vi.fn(),
}));
vi.mock("@/lib/translations", () => ({
  getEventTranslationsBatch: mocks.lookup,
}));
vi.mock("@/lib/timezone", () => ({ formatInDaLat: mocks.format }));
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => "de",
  getTranslations: async () =>
    Object.assign(
      (key: string, values?: { organizer?: string }) =>
        values?.organizer ? `${key}: ${values.organizer}` : key,
      {
        rich: (
          _key: string,
          values: { venue: string; link: (text: string) => React.ReactNode },
        ) => values.link(values.venue),
      },
    ),
}));
vi.mock("@/lib/supabase/server", () => ({
  createStaticClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      neq: () => query,
      gte: () => query,
      order: () => query,
      limit: async () => ({ data: mocks.rows }),
    };
    return { from: () => query };
  },
}));

const translated = {
  id: "translated",
  slug: "language-night",
  title: "Language exchange night",
  image_url: null,
  starts_at: "2099-01-01T10:00:00Z",
  location_name: "Social House Dalat",
  status: "published" as const,
};
const official = {
  ...translated,
  id: "official",
  slug: "social-house",
  title: "Social House Dalat",
  starts_at: "2099-01-02T10:00:00Z",
};
const organizer = {
  id: "owner",
  slug: "social-house-dalat",
  name: "Social House Dalat",
  logo_url: null,
  is_verified: false,
} as Organizer;
const surfaces = [
  [
    "organizer",
    () =>
      MoreFromOrganizer({
        organizer,
        events: [translated, official],
        currentEventId: "current",
      }),
  ],
  [
    "venue",
    () =>
      MoreAtVenue({
        venueId: "venue",
        venueName: "Social House Dalat",
        venueSlug: "social-house-dalat",
        currentEventId: "current",
      }),
  ],
] as const;
const renderSurface = async (component: (typeof surfaces)[number][1]) =>
  render(
    <NextIntlClientProvider
      locale="de"
      messages={{ translations: { showOriginal: "Original zeigen" } }}
    >
      {await component()}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  mocks.rows = [translated, official];
  mocks.lookup.mockResolvedValue(
    new Map([
      ["translated", { title: "Sprachaustausch am Abend" }],
      ["official", { title: "Social House Dalat" }],
    ]),
  );
  mocks.format.mockReturnValue("1. Jan.");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe.each(surfaces)("related %s events", (_name, component) => {
  it("batches localized titles and exposes exact originals outside navigation", async () => {
    const { container } = await renderSurface(component);
    expect(mocks.lookup).toHaveBeenCalledExactlyOnceWith(
      ["translated", "official"],
      "de",
    );
    expect(
      screen.getByRole("link", { name: /Sprachaustausch am Abend/ }),
    ).toHaveAttribute("href", "/events/language-night");
    const source = screen.getByText("Language exchange night");
    expect(source.closest("details")).not.toBeNull();
    expect(source.closest("a")).toBeNull();
    expect(container.querySelector("a details")).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /Social House Dalat 1. Jan./ }),
    ).toBeTruthy();
    expect(mocks.format).toHaveBeenCalledWith(
      translated.starts_at,
      "MMM d",
      "de",
    );
  });
  it("falls back to the original title without offering a false translation disclosure", async () => {
    mocks.lookup.mockResolvedValue(new Map());
    const { container } = await renderSurface(component);
    expect(
      screen.getByRole("link", { name: /Language exchange night/ }),
    ).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });
});
