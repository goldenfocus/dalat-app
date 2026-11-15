import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCalendar } from "./event-calendar";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
import type { CalendarEvent } from "@/lib/calendar";

const state = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => state.search }));
vi.mock("@/lib/i18n/routing", () => ({
  Link: ({ children, prefetch: _prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{children}</a>,
}));

const event: CalendarEvent = {
  id: "sample", slug: "sample", title: "Concert", originalTitle: "Buổi hòa nhạc",
  source_locale: "vi", image_url: null, starts_at: "2026-11-15T10:00:00Z", ends_at: null,
  ai_tags: ["music"], source_metadata: null, location_name: "Đà Lạt",
};
const mount = (locale = "en") => render(<NextIntlClientProvider locale={locale} messages={locale === "vi" ? viMessages : en}>
  <EventCalendar events={[event]} initialToday="2026-11-15" />
</NextIntlClientProvider>);
const dates = () => [...document.querySelectorAll("[data-calendar-date]")].map(el => el.getAttribute("data-calendar-date"));
const tab = (name: string) => fireEvent.click(screen.getAllByRole("tab", { name })[0]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  window.history.replaceState(null, "", "/calendar?utm_source=test");
  state.search = new URLSearchParams(window.location.search);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("calendar interactions", () => {
  it("opens at Nov 15–21 rather than the earlier days of the current week", () => {
    mount();
    expect(dates()).toEqual(["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
    expect(screen.getByText("Planning a trip to Đà Lạt?")).toBeInTheDocument();
  });
  it("switches to month immediately and keeps subsequent date navigation coherent", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    mount();
    expect(replace).not.toHaveBeenCalled();
    tab("Month");
    expect(dates()).toHaveLength(30);
    expect(dates()[0]).toBe("2026-11-15");
    expect(window.location.search).toContain("utm_source=test");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(dates()[0]).toBe("2026-12-15");
    tab("Week");
    expect(dates()).toHaveLength(7);
    expect(dates()[0]).toBe("2026-12-15");
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(dates()[0]).toBe("2026-11-15");
    tab("Day");
    expect(screen.getByRole("link", { name: /Concert/ })).toBeInTheDocument();
  });
  it("restores explicit query dates and browser history without shifting them", () => {
    state.search = new URLSearchParams("view=month&date=2026-12-04");
    mount();
    expect(dates()[0]).toBe("2026-12-04");
    window.history.replaceState(null, "", "/calendar?view=week&date=2026-11-20");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(dates()[0]).toBe("2026-11-20");
    expect(dates()).toHaveLength(7);
  });
  it("opens the selected weekday in Day view without moving the week while selecting", () => {
    mount();
    fireEvent.click(document.querySelector('[data-calendar-date="2026-11-17"]')!);
    expect(dates()[0]).toBe("2026-11-15");
    tab("Day");
    expect(window.location.search).toContain("date=2026-11-17");
  });
  it("localizes controls and keeps the original event title outside navigation", () => {
    mount("vi");
    expect(screen.getByText(viMessages.calendar.tripPlanner.planningTrip)).toBeInTheDocument();
    tab(viMessages.calendarView.views.month);
    expect(dates()).toHaveLength(30);
    const original = screen.getByText("Buổi hòa nhạc");
    expect(original.closest("details")).not.toBeNull();
    expect(original.closest("a")).toBeNull();
  });
});
