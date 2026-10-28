import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventPreparation } from "./event-preparation";
const { t } = vi.hoisted(() => ({ t: (key: string, args?: { name?: string }) => `${key}${args?.name ? ` ${args.name}` : ""}` }));
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => t }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: { display_name: "Vi" } }) }));
vi.mock("./language-setup", () => ({ LanguageSetup: () => <div>Language selections</div> }));
const preferences = { speaks: [{ language: "en", level: "native" }], learning: { language: "vi", level: "new" } };
const coffee = { id: "11111111-1111-4111-8111-111111111111", name: "Coffee", description: null, price_vnd: 45000, tags: [], image_url: null, is_sold_out: false };
const data = { event: { id: "event", slug: "exchange", title: "Exchange", startsAt: "2026-10-28T11:00:00Z", venueName: "Social House", orderingEnabled: true, isOpen: false, sponsorship: { sponsorName: "EZViet", eligibleItemIds: [coffee.id] } }, rsvpStatus: "going", sponsorEligibility: { eligible: true, position: 1, limit: 100, claimed: false }, profile: { name: "Vi" }, menu: [{ id: "section", slug: "coffee", title: "Coffee", note: null, items: [coffee] }], receipt: null, access: {} };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reuses saved language preferences and reserves one sponsored drink before check-in opens", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === "PUT" ? { preferences } : url.includes("/reserve") ? { order: { id: "order", status: "pending", items: [], total_vnd: 45000, sponsored_vnd: 45000, guest_due_vnd: 0, sponsor_status: "reserved", ready_for_preparation: false, paid_at: null } } : url.includes("/languages") ? { preferences } : data }));
  vi.stubGlobal("fetch", fetcher);
  render(<EventPreparation slug="exchange" />);
  expect(await screen.findByText("Vi")).toBeVisible();
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: coffee.id } });
  fireEvent.click(screen.getByRole("button", { name: "reserveFreeDrink" }));
  await screen.findByText("ready");
  const request = fetcher.mock.calls.find(([url]) => url.endsWith("/reserve"));
  expect(JSON.parse(request![1]!.body as string)).toMatchObject({ sponsoredItemId: coffee.id, items: [{ item_id: coffee.id, qty: 1 }] });
  expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
});
it("keeps a waitlisted attendee out of drink reservation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/languages") ? { preferences } : { ...data, rsvpStatus: "waitlist" } })));
  render(<EventPreparation slug="exchange" />);
  expect(await screen.findByText("rsvpFirst")).toBeVisible();
  expect(screen.queryByText("Language selections")).toBeNull();
});

it("shows the paid menu after the free-drink cutoff and lets the guest choose at the venue", async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/languages") ? { preferences } : { ...data, sponsorEligibility: { eligible: false, position: 101, limit: 100, claimed: false } } }));
  vi.stubGlobal("fetch", fetcher);
  render(<EventPreparation slug="exchange" />);
  expect(await screen.findByText("chooseFromMenu")).toBeVisible();
  expect(screen.getByText("venuePurchase")).toBeVisible();
  expect(screen.queryByText("chooseFreeDrink")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "chooseAtVenue" }));
  expect(await screen.findByText("ready")).toBeVisible();
  expect(fetcher.mock.calls.every(([url]) => !url.includes("/reserve"))).toBe(true);
});
