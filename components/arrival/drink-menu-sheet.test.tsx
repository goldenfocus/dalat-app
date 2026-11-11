vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ isGodMode: false }) }));
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DrinkMenuSheet, reservationQuantities } from "./drink-menu-sheet";
import type { ArrivalContext } from "@/lib/arrival/types";
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
const coffee = { id: "coffee", name: "Coffee", description: null, price_vnd: 45000, tags: [], image_url: null, is_sold_out: false };
const cake = { ...coffee, id: "cake", name: "Cake" };
const context: ArrivalContext = { event: { id: "e", slug: "exchange", title: "Exchange", startsAt: "2026-10-28T11:00:00Z", venueName: "Cafe", orderingEnabled: true, isOpen: true, sponsorship: { sponsorName: "EZViet", eligibleItemIds: [coffee.id], rsvpLimit: 100 } }, sponsorEligibility: { eligible: true, position: 100, limit: 100, claimed: false }, menu: [{ id: "s", title: "Menu", slug: "menu", note: null, items: [coffee, cake] }], profile: { name: "Guest" }, access: { canManage: false, canOrder: false, canWelcome: false }, receipt: null };
afterEach(cleanup);
it("offers only eligible beverages, while keeping the venue option available", () => {
  const onSelect = vi.fn(); const onLater = vi.fn();
  render(<DrinkMenuSheet context={context} open onLater={onLater} busy={false} failed={false} quantities={{}} onChange={vi.fn()} selected={null} onSelect={onSelect} note="" onNoteChange={vi.fn()} onReserve={vi.fn()} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText("complimentary")).toBeTruthy();
  expect(screen.getByText("paid")).toBeTruthy();
  expect(screen.getByText("Cake")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Coffee" }));
  expect(onSelect).toHaveBeenCalledWith("coffee");
  fireEvent.click(screen.getByRole("button", { name: "chooseAtVenue" }));
  expect(onLater).toHaveBeenCalledTimes(1);
});
it("adds exactly one complimentary unit alongside paid extras", () => {
  const extras = { coffee: 2, cake: 1 };
  expect(reservationQuantities(extras, "coffee")).toEqual({ coffee: 3, cake: 1 });
  expect(extras).toEqual({ coffee: 2, cake: 1 });
  expect(reservationQuantities(extras, null)).toEqual(extras);
});

it("never offers sponsorship to an ineligible guest", () => {
  render(<DrinkMenuSheet context={{ ...context, sponsorEligibility: { eligible: false, claimed: true, position: 101, limit: 100 } }} open onLater={vi.fn()} busy={false} failed={false} quantities={{}} onChange={vi.fn()} selected={null} onSelect={vi.fn()} note="" onNoteChange={vi.fn()} onReserve={vi.fn()} />);
  expect(screen.queryByText("complimentary")).toBeNull();
  expect(screen.queryByText("free")).toBeNull();
  expect(screen.getByText("paid")).toBeTruthy();
});
it("shows paid extras separately from the free selection", () => {
  render(<DrinkMenuSheet context={context} open onLater={vi.fn()} busy={false} failed={false} quantities={{ cake: 1 }} onChange={vi.fn()} selected="coffee" onSelect={vi.fn()} note="" onNoteChange={vi.fn()} onReserve={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Coffee" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("youPay").nextElementSibling?.textContent).toContain("45,000");
});
it("keeps paid extras visible when the complimentary choice changes", () => {
  const other = { ...coffee, id: "tea", name: "Tea" };
  const both = { ...context, event: { ...context.event, sponsorship: { ...context.event.sponsorship!, eligibleItemIds: [coffee.id, other.id] } }, menu: [{ ...context.menu[0], items: [coffee, cake, other] }] };
  render(<DrinkMenuSheet context={both} open onLater={vi.fn()} busy={false} failed={false} quantities={{ coffee: 1 }} onChange={vi.fn()} selected="tea" onSelect={vi.fn()} note="" onNoteChange={vi.fn()} onReserve={vi.fn()} />);
  expect(screen.getAllByText("Coffee")).toHaveLength(2);
  expect(screen.getByLabelText("noteLabel")).toBeTruthy();
});
