import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffArrivalContext } from "@/lib/arrival/types";

const { translate } = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => translate }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { HostWorkspace } from "./host-workspace";

const fixture: StaffArrivalContext = {
  event: { id: "event", slug: "test", title: "Test event", venueName: "Test venue", startsAt: "2026-10-28T12:00:00Z", isOpen: true, orderingEnabled: true },
  access: { canWelcome: true, canOrder: false, canManage: false },
  menu: [], participants: [], orders: [], rsvps: [], staff: [],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("arrival staff permissions in the UI", () => {
  it("lets welcome-only staff check in without payment, ordering or team controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }));
    render(<HostWorkspace slug="test" />);
    fireEvent.click(await screen.findByRole("button", { name: "hostWalkIn" }));
    expect(screen.getByLabelText("nickname")).toBeVisible();
    expect(screen.queryByRole("button", { name: "hostOrders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hostTeam" })).toBeNull();
    expect(screen.queryByText("menuTitle")).toBeNull();
  });

  it("checks in a searched account without an RSVP using its saved language choices", async () => {
    const account = {
      id: "account:new-user", user_id: "new-user", displayName: "Mai", username: "mai",
      checked_in_at: null, preferences: { practiceLanguage: "english", englishLevel: "starting", vietnameseLevel: "native" },
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => url.endsWith("/search") ? { accounts: [account] } : init?.method === "POST" ? {} : fixture,
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<HostWorkspace slug="test" />);
    fireEvent.change(await screen.findByRole("searchbox", { name: "hostAccountSearch" }), { target: { value: "mai@example.test" } });
    fireEvent.click(await screen.findByRole("button", { name: "checkIn" }));
    expect(screen.queryByLabelText("nickname")).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/events/test/arrival" && init?.method === "POST")).toBe(true));
    const [, init] = fetchMock.mock.calls.find(([url, options]) => url === "/api/events/test/arrival" && options?.method === "POST")!;
    expect(JSON.parse(init.body)).toMatchObject({ userId: "new-user", staffEntry: true, nickname: "Mai", practiceLanguage: "english", englishLevel: "starting", vietnameseLevel: "native", items: [] });
  });

  it("shows the kitchen queue to order staff and retains a stale-order conflict after refreshing", async () => {
    const data: StaffArrivalContext = {
      ...fixture, access: { canWelcome: false, canOrder: true, canManage: false },
      orders: [{ id: "order", user_id: null, participant_id: "person", status: "pending", total_vnd: 35000, note: null, paid_at: null, created_at: "2026-10-28T12:00:00Z", guestName: "Guest", items: [{ menu_item_id: "coffee", name_snapshot: "Coffee", qty: 1, unit_price_vnd: 35000 }] }],
    };
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => init?.method === "POST"
      ? { ok: false, status: 409 }
      : { ok: true, json: async () => data });
    vi.stubGlobal("fetch", fetchMock);
    render(<HostWorkspace slug="test" />);
    const accept = await screen.findByRole("button", { name: "hostAccept" });
    expect(screen.queryByRole("button", { name: "hostArrivals" })).toBeNull();
    expect(screen.queryByRole("button", { name: "hostTeam" })).toBeNull();
    fireEvent.click(accept);
    expect(await screen.findByRole("alert")).toHaveTextContent("hostConflict");
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(3));
    const action = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(action).toEqual({ action: "setOrderStatus", orderId: "order", status: "confirmed", expectedStatus: "pending" });
    expect(screen.getByRole("alert")).toHaveTextContent("hostConflict");
  });
});

it("finishes slow refreshes without overlapping and refreshes when staff return", async () => {
 let resolveLoad: (value: unknown) => void = () => {};
 const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveLoad = resolve; })).mockResolvedValue({ ok: true, json: async () => fixture });
 vi.stubGlobal("fetch", fetcher);
 render(<HostWorkspace slug="test" />);
 fireEvent(window, new Event("focus"));fireEvent(window, new Event("online"));
 expect(fetcher).toHaveBeenCalledTimes(1);
 resolveLoad({ ok: true, json: async () => fixture });
 await screen.findByRole("button", { name: "hostWalkIn" });
 fireEvent(window, new Event("focus"));
 await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});

it("does not starve a response taking longer than the five-second polling interval", async () => {
 vi.useFakeTimers();
 let resolveLoad: (value: unknown) => void = () => {};
 const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveLoad = resolve; })).mockResolvedValue({ ok: true, json: async () => fixture });
 vi.stubGlobal("fetch", fetcher);render(<HostWorkspace slug="test" />);
 await act(async () => { vi.advanceTimersByTime(15000); });
 expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async () => { resolveLoad({ ok: true, json: async () => fixture }); });
 expect(screen.getByRole("button", { name: "hostWalkIn" })).toBeInTheDocument();
 await act(async () => { vi.advanceTimersByTime(5000); });
 expect(fetcher).toHaveBeenCalledTimes(2);
});
