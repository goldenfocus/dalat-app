import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { PracticeView } from "@/lib/practice/model";
// Falls back to the key so new strings resolve before and after the catalogs are merged.
function tr(key: string, args: Record<string, unknown> = {}) { return Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), (en.eventPractice as Record<string, string>)[key] ?? key); }
vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string, args: Record<string, unknown> = {}) => tr(key, args) }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: null }) }));
vi.mock("@/lib/i18n/routing", () => ({ usePathname: () => "/events/test", useRouter: () => ({ replace: vi.fn() }), Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { EventPractice, remainingSeconds } from "./event-practice";
import { createRehearsal, mutateRehearsal, rehearsalView } from "./rehearsal-model";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const now = "2026-11-04T12:00:00.000Z";
const anonymous: PracticeView = { canStart: false, count: 2, me: null, revision: 1, serverNow: now, tables: [{ number: 4, floor: "downstairs", capacity: 2, available: true }], floorPolicy: "balanced", draft: null, participation: null, myTable: null, round: { number: 1, startedAt: now, endsAt: "2026-11-04T12:12:00.000Z", minutes: 12, groups: [] }, groups: [], myGroup: [], myGroupNumber: null };
const me = { id: "me", name: "Mai", number: 1, learns: "en", speaks: ["vi"] };
const partner = { id: "partner", name: "Alex", number: 2, learns: "vi", speaks: ["en"] };
const found: PracticeView = { ...anonymous, me, participation: "playing", groups: [[me, partner]], myGroup: [me, partner], myGroupNumber: 7, myTable: { groupIndex: 6, tableNumber: 4, floor: "downstairs" } };
function fetchView(view: PracticeView) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => view })); }
describe("event table flow", () => {
  it.each(["pending", "absent"])("keeps %s RSVPs visible while starting with arrivals", async status => {
    let session = createRehearsal(3);
    const transport = vi.fn(async (payload?: Record<string, unknown>) => {
      if (payload) session = mutateRehearsal(session, payload);
      return new Response(JSON.stringify(rehearsalView(session)));
    });
    render(<EventPractice slug="sample-rehearsal" transport={transport} />);
    expect(await screen.findByRole("button", { name: en.eventPractice.startGame })).toBeDisabled();
    for (const name of ["Mai", "Alex"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
      fireEvent.click(screen.getByRole("button", { name: `Confirm ${name} is here` }));
      await waitFor(() => expect(session.state.presence?.[name === "Mai" ? "sample-1" : "sample-2"]).toBe("present"));
    }
    if (status === "absent") {
      fireEvent.click(screen.getByRole("button", { name: /Linh/ }));
      fireEvent.click(screen.getByRole("button", { name: "Mark Linh absent" }));
      await waitFor(() => expect(session.state.presence?.["sample-3"]).toBe("absent"));
    }
    fireEvent.click(screen.getByRole("button", { name: en.eventPractice.startGame }));
    await waitFor(() => expect(session.state.rounds).toHaveLength(1));
    expect(session.state.rounds[0].groups.flat().map(p => p.name).sort()).toEqual(["Alex", "Linh", "Mai"]);
    expect(rehearsalView(session).count).toBe(2);
  });
  it("recovers the receipt, shows the table before Play, and keeps cards local", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? found : anonymous }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    fireEvent.click(await screen.findByText(en.eventPractice.findHint));
    fireEvent.change(screen.getByLabelText("Check-in code"), { target: { value: "12abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my partner" }));
    expect(await screen.findByRole("button", { name: "Table 4, Downstairs" })).toBeVisible();
    expect(screen.getByText("Alex", { exact: true })).toBeVisible();
    expect(screen.getByRole("timer")).toHaveTextContent("12:00");
    expect(screen.queryByRole("button", { name: tr("cardsNext") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: tr("cardsNext") })).toBeVisible();
    expect(document.querySelector('a[href*="ezviet.org"]')).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body))).toEqual([{ action: "find", code: "12ABCDEF" }]);
  });
  it("lets a visitor join without another check-in through the seat disclosure", async () => {
    const visitor = { ...found, participation: "visiting" as const, groups: [], myGroup: [], myTable: null };
    const transport = vi.fn(async (payload?: Record<string, unknown>) => new Response(JSON.stringify(payload ? { ...found, revision: 2 } : visitor)));
    render(<EventPractice slug="sample" transport={transport}/>);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Change participation: Visiting / helping" }));
    fireEvent.click(await screen.findByRole("button", { name: "Play next round" }));
    await waitFor(() => expect(transport).toHaveBeenCalledWith({ action: "participation", status: "playing", expectedRevision: 1 }));
  });
  it("keeps cards available after the round and seeds a different first card each round", async () => {
    fetchView({ ...found, round: { ...found.round!, endedAt: now } });
    const first = render(<EventPractice slug="test"/>);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    const before = first.container.querySelector('p[lang="vi"].text-2xl')?.textContent;
    expect(screen.getByRole("timer")).toHaveTextContent(en.eventPractice.roundComplete);
    first.unmount();
    fetchView({ ...found, round: { ...found.round!, number: 2 } });
    const second = render(<EventPractice slug="test"/>);
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(second.container.querySelector('p[lang="vi"].text-2xl')?.textContent).not.toBe(before);
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
  it.each(["before check-in", "hosting"])("starts the planned seats while %s", async status => {
    fetchView({ ...anonymous, canStart: true, round: null, ...(status === "hosting" ? { me, participation: "hosting" as const } : {}) });
    render(<EventPractice slug="test"/>);
    fireEvent.click(await screen.findByRole("button", { name: en.eventPractice.startGame }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.body === JSON.stringify({ action: "startGame", minutes: 20, expectedRevision: 1 }))).toBe(true));
  });
  it("previews a guest without performing a write or changing identity", async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ ...found, canStart: true, participants: [{ ...me, participation: "playing", presence: "present" }, { ...partner, participation: "playing", presence: "present" }], assignments: [{ ...found.myTable!, groupIndex: 0 }] })));
    render(<EventPractice slug="sample" transport={transport}/>);
    fireEvent.click(await screen.findByRole("button", { name: /Mai/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guest view" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Mai");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: tr("cardsNext") })).toBeVisible();
    expect(transport.mock.calls.flat().every(payload => payload === undefined)).toBe(true);
  });
  it("keeps the last confirmed table after a failed move", async () => {
    const host = { ...found, canStart: true, participants: [{ ...me, participation: "playing", presence: "present" }, { ...partner, participation: "playing", presence: "present" }], assignments: [{ ...found.myTable!, groupIndex: 0 }] };
    const transport = vi.fn(async (payload?: Record<string, unknown>) => new Response(JSON.stringify(payload ? { code: "invalid_table_capacity" } : host), { status: payload ? 400 : 200 }));
    render(<EventPractice slug="sample" transport={transport}/>);
    fireEvent.click(await screen.findByRole("button", { name: /Mai/ }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Mai absent" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en.eventPractice.notEnoughSeats);
    expect(screen.getByRole("region", { name: "Table 4" })).toBeVisible();
  });
  it("consumes a new receipt fragment even when the game page is already open", async () => {
    const fetcher = vi.fn(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? { ...found, me: { ...me, name: "Recovered guest" } } : found }));
    vi.stubGlobal("fetch", fetcher);
    render(<EventPractice slug="test"/>);
    await screen.findByRole("button", { name: "Play" });
    window.history.replaceState(null, "", "#ticket=signed-test-receipt");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.body === JSON.stringify({ action: "claim", token: "signed-test-receipt" }))).toBe(true));
    expect(window.location.hash).toBe("");
  });
  it("only confirms arrival once and uses the returned table", async () => {
    const transport = vi.fn(async (payload?: Record<string, unknown>) => new Response(JSON.stringify({ ...found, presence: payload ? "present" : "pending", revision: payload ? 2 : 1 })));
    render(<EventPractice slug="sample" transport={transport}/>);
    fireEvent.click(await screen.findByRole("button", { name: "I’m here" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "I’m here" })).toBeNull());
    expect(transport).toHaveBeenCalledWith({ action: "arrive", expectedRevision: 1 });
    expect(screen.getByRole("button", { name: "Table 4, Downstairs" })).toBeVisible();
  });
});
describe("authoritative round countdown", () => {
  it("uses the persisted deadline and holds a paused clock", () => {
    expect(remainingSeconds(anonymous.round, Date.parse(now) + 60_000)).toBe(660);
    expect(remainingSeconds({ ...anonymous.round!, pausedAt: now, remainingSeconds: 355 }, Date.parse(now) + 900_000)).toBe(355);
    expect(remainingSeconds({ ...anonymous.round!, endedAt: now }, Date.parse(now))).toBe(0);
  });
});
