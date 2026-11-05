import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffArrivalContext } from "@/lib/arrival/types";
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("./arrival-menu", () => ({
  ArrivalMenu: ({ onChange }: { onChange: (value: Record<string, number>) => void }) => <button type="button" onClick={() => onChange({ coffee: 1 })}>TEST MENU</button>,
  cartLines: (_menu: unknown, quantities: Record<string, number>) => quantities.coffee ? [{ item_id: "coffee", qty: 1 }] : [],
}));
import { HostArrivals } from "./host-arrivals";

const person = { id: "rsvp", user_id: "user", displayName: "Mai", username: "mai", checked_in_at: null, preferences: { practiceLanguage: "english" as const, englishLevel: "starting" as const, vietnameseLevel: "native" as const } };
const order = { id: "order", user_id: "user", participant_id: "person", status: "pending" as const, total_vnd: 40000, note: null, paid_at: null, created_at: "2026-11-04T10:00:00Z", items: [{ menu_item_id: "coffee", name_snapshot: "Preordered coffee", qty: 1, unit_price_vnd: 40000 }] };
const fixture: StaffArrivalContext = {
  event: { id: "event", slug: "test", title: "Test", startsAt: "2026-11-04T12:00:00Z", venueName: "Venue", isOpen: true, orderingEnabled: true },
  access: { canWelcome: true, canOrder: true, canManage: false }, menu: [], participants: [], orders: [], rsvps: [person], staff: [],
};
const participant = { id: "person", event_id: "event", user_id: "user", nickname: "Mai", practice_language: "english" as const, english_level: "starting" as const, vietnamese_level: "native" as const, checked_in_at: "2026-11-04T10:00:00Z" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("check-in stays separate from ordering", () => {
  it("shows a preorder and checks in a known guest once without opening the menu", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const saved = vi.fn().mockResolvedValue(undefined);
    render(<HostArrivals data={{ ...fixture, orders: [order] }} slug="test" guestPath="/test" busy={false} onSaved={saved} />);
    expect(screen.getByText(/1 × Preordered coffee/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    expect(screen.queryByText("TEST MENU")).toBeNull();
    expect(screen.queryByLabelText("nickname")).toBeNull();
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ userId: "user", items: [], note: "", staffEntry: true });
  });
  it("asks for missing check-in details without showing the menu even to order staff", () => {
    render(<HostArrivals data={{ ...fixture, rsvps: [{ ...person, preferences: null }] }} slug="test" guestPath="/test" busy={false} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    expect(screen.getByLabelText("nickname")).toHaveValue("Mai");
    expect(screen.queryByText("TEST MENU")).toBeNull();
  });
  it("opens the menu only through the explicit add-order action", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<HostArrivals data={{ ...fixture, participants: [participant], rsvps: [] }} slug="test" guestPath="/test" busy={false} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "hostAddOrder" }));
    fireEvent.click(screen.getByRole("button", { name: "TEST MENU" }));
    fireEvent.click(screen.getByRole("button", { name: "hostSaveAndOrder" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ participantId: "person", items: [{ item_id: "coffee", qty: 1 }] });
  });
  it("shows an arrived guest's preorder without offering a second menu", () => {
    render(<HostArrivals data={{ ...fixture, participants: [participant], rsvps: [], orders: [order] }} slug="test" guestPath="/test" busy={false} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "hostViewOrder" }));
    expect(screen.getByText(/1 × Preordered coffee/)).toBeVisible();
    expect(screen.queryByText("TEST MENU")).toBeNull();
  });
});
