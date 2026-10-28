import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
