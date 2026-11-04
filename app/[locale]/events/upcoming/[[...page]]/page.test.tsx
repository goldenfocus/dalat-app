import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UpcomingEventsPage from "./page";

const { queryCalls, rows } = vi.hoisted(() => ({
  queryCalls: [] as string[],
  rows: [
    { id: "live", slug: "tonights-exchange", title: "Tonight’s exchange", status: "published", starts_at: "2026-11-04T11:00:00Z", ends_at: "2026-11-04T13:00:00Z", series_id: "series" },
    { id: "next", slug: "next-weeks-exchange", title: "Next week’s exchange", status: "published", starts_at: "2026-11-11T11:00:00Z", ends_at: "2026-11-11T13:00:00Z", series_id: "series" },
    { id: "other", slug: "tomorrows-workshop", title: "Tomorrow’s workshop", status: "published", starts_at: "2026-11-05T11:00:00Z", ends_at: null },
  ],
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => ({ title: "Live & Upcoming Events", "happeningNow.title": "Happening Now", "tabs.upcoming": "Upcoming" })[key] || key,
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/i18n/routing", () => ({ buildLocales: ["en"], Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/supabase/server", () => ({ createStaticClient: () => ({ from: (table: string) => {
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { queryCalls.push(`${key}=${value}`); return query; },
    or: (value: string) => { queryCalls.push(value); return query; },
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
    in: async () => ({ data: table === "event_series" ? [{ id: "series", slug: "exchange" }] : [], error: null }),
  }; return query;
} }) }));
vi.mock("@/lib/cache/server-cache", () => ({ getCachedEventSocialBatch: async () => ({}) }));
vi.mock("@/lib/translations", () => ({ getEventTranslationsBatch: async () => new Map() }));
vi.mock("@/lib/metadata", () => ({ generateLocalizedMetadata: vi.fn() }));
vi.mock("@/lib/structured-data", () => ({ JsonLd: () => null, generateBreadcrumbSchema: () => ({}) }));
vi.mock("@/components/events/event-view-toggle", () => ({ EventViewToggle: () => null }));
vi.mock("@/components/ui/pagination", () => ({ Pagination: () => null }));
vi.mock("@/components/events/event-grid", () => ({ EventGrid: ({ events }: { events: typeof rows }) => <div>{events.map(event => <a key={event.id} href={`/events/${event.slug}`}>{event.title}</a>)}</div> }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T11:30:00Z")); queryCalls.length = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("renders the current event ahead of upcoming choices after it has started", async () => {
  render(await UpcomingEventsPage({ params: Promise.resolve({ locale: "en" }) }));
  expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual(["Happening Now", "Upcoming"]);
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["Tonight’s exchange", "Tomorrow’s workshop"]);
  expect(screen.getByRole("link", { name: "Tonight’s exchange" })).toHaveAttribute("href", "/events/tonights-exchange");
  expect(queryCalls).toContain("status=published");
  expect(queryCalls).toContain("starts_at.gt.2026-11-04T11:30:00.000Z,ends_at.gt.2026-11-04T11:30:00.000Z,and(ends_at.is.null,starts_at.gt.2026-11-04T07:30:00.000Z)");
});
it("removes the finished occurrence and exposes the series next date", async () => {
  vi.setSystemTime(new Date("2026-11-04T13:00:00Z"));
  render(await UpcomingEventsPage({ params: Promise.resolve({ locale: "en" }) }));
  expect(screen.queryByRole("heading", { name: "Happening Now" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Tonight’s exchange" })).toBeNull();
  expect(screen.getByRole("link", { name: "Next week’s exchange" })).toBeVisible();
});
