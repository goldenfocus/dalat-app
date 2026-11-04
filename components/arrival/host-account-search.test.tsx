import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffArrivalContext } from "@/lib/arrival/types";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
import { HostAccountSearch } from "./host-account-search";
const data: StaffArrivalContext = { event: { id: "event", slug: "test", title: "Test", venueName: "Venue", startsAt: "", isOpen: true, orderingEnabled: false }, access: { canWelcome: true, canOrder: false, canManage: false }, menu: [], participants: [], orders: [], rsvps: [], staff: [] };
const account = { id: "account:user", user_id: "user", displayName: "Mai Nguyễn", username: "mainguyen", checked_in_at: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("host account search", () => {
 it("selects an account without an RSVP and keeps email out of the URL", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accounts: [account] }) });
  vi.stubGlobal("fetch", fetchMock);
  const select = vi.fn();
  render(<HostAccountSearch query="mai@example.test" slug="test" data={data} onSelect={select} />);
  fireEvent.click(await screen.findByRole("button", { name: "checkIn" }));
  expect(select).toHaveBeenCalledWith(account);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/events/test/arrival/search");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: "mai@example.test" });
 });
 it("shows an already checked-in person without another check-in button", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accounts: [account] }) }));
  render(<HostAccountSearch query="mai" slug="test" data={{ ...data, rsvps: [{ ...account, checked_in_at: "2026-11-04T10:00:00Z" }] }} onSelect={vi.fn()} />);
  expect(await screen.findByText("hostAlreadyHere")).toBeVisible();
  expect(screen.queryByRole("button", { name: "checkIn" })).toBeNull();
 });
 it("does not search on empty or one-character input", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  render(<HostAccountSearch query="@a" slug="test" data={data} onSelect={vi.fn()} />);
  expect(screen.queryByText("hostMatchingAccounts")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("does not offer a result from an old query while a new search is pending", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ accounts: [account] }) }).mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<HostAccountSearch query="mai" slug="test" data={data} onSelect={vi.fn()} />);
  await screen.findByText("Mai Nguyễn");
  view.rerender(<HostAccountSearch query="linh" slug="test" data={data} onSelect={vi.fn()} />);
  expect(screen.queryByText("Mai Nguyễn")).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
 });
});
