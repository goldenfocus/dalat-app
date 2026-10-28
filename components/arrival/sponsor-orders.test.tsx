import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArrivalOrder, StaffArrivalContext } from "@/lib/arrival/types";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
import { HostOrders } from "./host-orders";
import { SponsorLedger } from "./sponsor-ledger";
import { ArrivalOrderView } from "./arrival-receipt";
import { HostGuestForm } from "./host-guest-form";

const sponsoredOrder = {
  id: "order-sponsored", participant_id: null, user_id: "guest", status: "pending",
  total_vnd: 90000, sponsored_vnd: 50000, guest_due_vnd: 40000, sponsor_status: "reserved",
  sponsor_item_id: "coffee", sponsor_settled_at: null, ready_for_preparation: false,
  note: null, paid_at: null, created_at: "2026-10-28T10:00:00Z", guestName: "Vi",
  items: [
    { menu_item_id: "coffee", name_snapshot: "Coffee", qty: 1, unit_price_vnd: 50000 },
    { menu_item_id: "tea", name_snapshot: "Tea", qty: 1, unit_price_vnd: 40000 },
  ],
} satisfies ArrivalOrder;
const ledgerData = {
  event: { id: "event", slug: "test", title: "Test event", venueName: "Venue", startsAt: "2026-10-28T11:00:00Z", isOpen: true, orderingEnabled: true },
  access: { canWelcome: true, canOrder: true, canManage: true },
  menu: [], participants: [], orders: [sponsoredOrder], staff: [], rsvps: [],
  sponsorAccounting: { reserved_vnd: 50000, owed_vnd: 0, settled_vnd: 0 },
} satisfies StaffArrivalContext;

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("sponsored order operations", () => {
  it("prevents preparation before check-in and separates what the guest owes", () => {
    render(<HostOrders orders={[sponsoredOrder]} busy={false} act={vi.fn()} />);
    expect(screen.getByRole("button", { name: "hostAccept" })).toBeDisabled();
    expect(screen.getByText("sponsorWaitForCheckIn")).toBeVisible();
    expect(screen.getByText("sponsorCovered")).toBeVisible();
    expect(screen.getByText("sponsorGuestDue")).toBeVisible();
    expect(screen.getByText("sponsorNoCollect")).toBeVisible();
    expect(screen.getByRole("button", { name: "hostMarkPaid" })).toBeEnabled();
  });

  it("never offers guest-payment collection for a fully sponsored order", () => {
    render(<HostOrders orders={[{ ...sponsoredOrder, total_vnd: 50000, guest_due_vnd: 0, items: sponsoredOrder.items.slice(0, 1), ready_for_preparation: true, sponsor_status: "owed" }]} busy={false} act={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "hostMarkPaid" })).toBeNull();
    expect(screen.getByRole("button", { name: "hostAccept" })).toBeEnabled();
  });

  it("does not tell a fully sponsored guest to pay at the venue", () => {
    render(<ArrivalOrderView order={{ ...sponsoredOrder, total_vnd: 50000, guest_due_vnd: 0, items: sponsoredOrder.items.slice(0, 1) }} />);
    expect(screen.queryByText("payAtVenue")).toBeNull();
    expect(screen.getByText("sponsorGuestReserved")).toBeVisible();
  });

  it("keeps remaining guest purchases payable at venue", () => {
    render(<ArrivalOrderView order={sponsoredOrder} />);
    expect(screen.getByText("payAtVenue")).toBeVisible();
  });

  it("does not expose the sponsor ledger to order-taking staff", () => {
    render(<SponsorLedger data={{ ...ledgerData, access: { ...ledgerData.access, canManage: false } }} busy={false} act={vi.fn()} />);
    expect(screen.queryByText("sponsorLedgerTitle")).toBeNull();
  });

  it("records settlement only after explicit confirmation and keeps it separate from guest payment", () => {
    const act = vi.fn().mockResolvedValue(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const order = { ...sponsoredOrder, ready_for_preparation: true, status: "fulfilled" as const, sponsor_status: "owed" as const };
    render(<SponsorLedger data={{ ...ledgerData, orders: [order] }} busy={false} act={act} />);
    fireEvent.click(screen.getByRole("button", { name: "sponsorMarkSettled" }));
    expect(act).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "sponsorMarkSettled" }));
    expect(act).toHaveBeenCalledWith({ action: "settleSponsor", orderId: order.id });
    expect(confirm).toHaveBeenCalledWith("sponsorSettleConfirm");
  });

  it("cannot settle an unclaimed reservation", () => {
    render(<SponsorLedger data={ledgerData} busy={false} act={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "sponsorMarkSettled" })).toBeNull();
  });
});


describe("staff sponsored drink selection", () => {
  const rsvp = { sponsorEligible: true, id: "rsvp", user_id: "guest", displayName: "Vi", username: "vivian", checked_in_at: null };
  const data: StaffArrivalContext = {
    ...ledgerData,
    event: { ...ledgerData.event, sponsorship: { sponsorName: "EZViet", eligibleItemIds: ["coffee"] } },
    orders: [], rsvps: [rsvp],
    menu: [{ id: "drinks", slug: "drinks", title: "Drinks", note: null, items: [{ id: "coffee", name: "Coffee", description: null, price_vnd: 50000, tags: [], image_url: null, is_sold_out: false }] }],
  };

  it("attaches one selected eligible drink to a registered attendee's check-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<HostGuestForm data={data} slug="test" rsvp={rsvp} onSaved={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("languageTitle"), { target: { value: "vietnamese" } });
    fireEvent.change(screen.getByLabelText("englishLevel"), { target: { value: "comfortable" } });
    fireEvent.change(screen.getByLabelText("vietnameseLevel"), { target: { value: "starting" } });
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByLabelText("sponsorStaffChoose")).toHaveValue("coffee");
    fireEvent.click(screen.getByRole("button", { name: "hostSaveAndOrder" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ userId: "guest", sponsoredItemId: "coffee", staffEntry: true, items: [{ item_id: "coffee", qty: 1 }] });
  });

  it("reuses saved language answers at the door without asking Vi again", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const savedRsvp = { ...rsvp, languagePreferences: { speaks: [{ language: "en" as const, level: "native" as const }], learning: { language: "vi" as const, level: "new" as const } } };
    render(<HostGuestForm data={data} slug="test" rsvp={savedRsvp} onSaved={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText("englishLevel")).toBeNull();
    expect(screen.queryByLabelText("vietnameseLevel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ englishLevel: "native", vietnameseLevel: "starting", practiceLanguage: "vietnamese" });
  });

  it("preserves all six legacy levels when staff use a returning RSVP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const returningRsvp = { ...rsvp, preferences: { practiceLanguage: "vietnamese" as const, englishLevel: "native" as const, vietnameseLevel: "advanced" as const } };
    render(<HostGuestForm data={data} slug="test" rsvp={returningRsvp} onSaved={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("englishLevel")).toHaveValue("native");
    expect(screen.getByLabelText("vietnameseLevel")).toHaveValue("advanced");
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ englishLevel: "native", vietnameseLevel: "advanced", practiceLanguage: "vietnamese" });
  });

  it("does not offer a sponsored drink to an anonymous walk-in", () => {
    render(<HostGuestForm data={data} slug="test" onSaved={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.queryByLabelText("sponsorStaffChoose")).toBeNull();
  });
});
