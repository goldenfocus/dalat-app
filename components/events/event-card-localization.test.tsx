import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/de.json";
import type { Event } from "@/lib/types";
import { EventCard } from "./event-card";

vi.mock("@/lib/i18n/routing", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/prefetch", () => ({
  usePrefetch: () => ({ prefetchEvent: vi.fn(), prefetchEventCounts: vi.fn() }),
}));

const event = {
  id: "language-exchange",
  slug: "language-exchange",
  title: "Sprachaustausch",
  starts_at: "2026-10-28T11:00:00Z",
  ends_at: null,
  image_url: null,
  source_platform: "activity-graph",
  location_name: "Social House Dalat",
} as Event;

function firstRender(overrides: Partial<Event> = {}) {
  // Server rendering runs no effects: formatting must work before any lazy
  // date-fns locale has loaded, independently of the provider's time zone.
  const html = renderToString(
    <NextIntlClientProvider locale="de" messages={messages} timeZone="UTC">
      <EventCard event={{ ...event, ...overrides }} isFlipped />
    </NextIntlClientProvider>,
  );
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.textContent ?? "";
}

describe("EventCard localized date and time", () => {
  it("renders German weekdays, months and local clock time on the first render", () => {
    const text = firstRender();
    expect(text).toMatch(/Mittwoch,? 28\. Okt\./);
    expect(text).toContain("18:00");
    expect(text).not.toMatch(/\b(?:Wed|Oct|PM|AM)\b/);
  });

  it("uses the Da Lat calendar day when UTC is still the preceding day", () => {
    const text = firstRender({ starts_at: "2026-10-27T23:30:00Z" });
    expect(text).toMatch(/Mittwoch,? 28\. Okt\./);
    expect(text).toContain("6:30");
  });

  it("keeps date-known Lam Vien notices' unknown time instead of inventing one", () => {
    const text = firstRender({
      source_metadata: { schedule_policy: "lam_vien_date_known_time_tbd" },
    });
    expect(text).toMatch(/Mittwoch,? 28\. Okt\./);
    expect(text).toContain("TBD");
    expect(text).not.toContain("18:00");
  });
});
