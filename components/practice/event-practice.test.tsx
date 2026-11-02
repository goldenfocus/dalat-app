import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { PracticeView } from "@/lib/practice/model";
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof en.eventPractice, args: Record<string, unknown> = {}) => Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), en.eventPractice[key]) }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: null }) }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
import { EventPractice, remainingSeconds } from "./event-practice";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const now = "2026-11-04T12:00:00.000Z";
const anonymous: PracticeView = { canStart: false, count: 2, me: null, revision: 1, serverNow: now, tables: [{ number: 4, floor: "downstairs", capacity: 2, available: true }], floorPolicy: "balanced", draft: null, participation: null, myTable: null, round: { number: 1, startedAt: now, endsAt: "2026-11-04T12:12:00.000Z", minutes: 12, groups: [] }, groups: [], myGroup: [], myGroupNumber: null };
const me = { id: "me", name: "Mai", number: 1, learns: "en", speaks: ["vi"] };
const partner = { id: "partner", name: "Alex", number: 2, learns: "vi", speaks: ["en"] };
const found: PracticeView = { ...anonymous, me, participation: "playing", groups: [[me, partner]], myGroup: [me, partner], myGroupNumber: 7, myTable: { groupIndex: 6, tableNumber: 4, floor: "downstairs" } };
function fetchView(view: PracticeView) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => view })); }
describe("event pairing visibility", () => {
  it("recovers the existing receipt and leads with the real table, floor, partner and clock", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? found : anonymous }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    expect(await screen.findByRole("heading", { name: "Find your partner" })).toBeVisible();
    fireEvent.click(screen.getByText(en.eventPractice.findHint));
    fireEvent.change(await screen.findByLabelText("Check-in code"), { target: { value: "12abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my partner" }));
    expect(await screen.findByRole("heading", { name: "Your partner" })).toBeVisible();
    expect(screen.getByText("Table 4")).toBeVisible();
    expect(screen.getByText("Downstairs")).toBeVisible();
    expect(screen.getByText("Alex #2")).toBeVisible();
    expect(screen.getByText("You: Mai #1 · Group 7")).toBeVisible();
    expect(screen.getByRole("timer")).toHaveTextContent("12:00");
    expect(screen.getByRole("link", { name: en.eventPractice.openActivity })).toHaveAttribute("href", "https://ezviet.org/challenges?event=test&practice=1");
    expect(screen.queryByRole("button", { name: "Start practice" })).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.body?.includes('"action":"find"'))).toBe(true));
  });
  it("lets a present visitor join the next pairing without another check-in", async () => {
    const visitor = { ...found, participation: "visiting" as const, myGroup: [], myTable: null };
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? { ...visitor, participation: "playing", revision: 2 } : visitor }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    fireEvent.click(await screen.findByRole("button", { name: "Join practice" }));
    expect(await screen.findByText(en.eventPractice.joinNext)).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.body === JSON.stringify({ action: "participation", status: "playing", expectedRevision: 1 }))).toBe(true);
    expect(screen.queryByLabelText("Check-in code")).toBeNull();
  });
  it("shows challenge entry after round end without adding identity or course to the URL", async () => {
    fetchView({ ...found, round: { ...found.round!, endedAt: now } });
    render(<EventPractice slug="event slug" />);
    expect(await screen.findByRole("link", { name: en.eventPractice.challenge })).toHaveAttribute("href", "https://ezviet.org/challenges?event=event%20slug");
  });
  it("requires host draft review before publishing a round", async () => {
    const host: PracticeView = { ...anonymous, canStart: true, round: null, participants: [{ ...me, participation: "playing" }, { ...partner, participation: "playing" }] };
    const drafted: PracticeView = { ...host, revision: 2, draft: { id: "draft-one", round: 1, minutes: 12, groups: [[me, partner]], assignments: [{ groupIndex: 0, tableNumber: 4, floor: "downstairs" }], rosterFingerprint: "current", createdAt: now } };
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? drafted : host }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    expect(screen.queryByRole("button", { name: "Start this round" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Draft groups" }));
    expect(await screen.findByRole("heading", { name: "Review draft · round 1" })).toBeVisible();
    expect(screen.getByText("Table 4 · Downstairs · Group 1")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start this round" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.body?.includes('"draftId":"draft-one"') && init.body.includes('"expectedRevision":2'))).toBe(true));
  });
  it("uses injected rehearsal responses without calling any event API or forwarding a sample cohort", async () => {
    const realFetch = vi.fn();
    vi.stubGlobal("fetch", realFetch);
    const transport = vi.fn().mockImplementation(async payload => new Response(JSON.stringify(payload ? { ...found, participation: "visiting", revision: 2 } : found), { status: 200 }));
    render(<EventPractice slug="sample-rehearsal" transport={transport} />);
    expect(await screen.findByText("Table 4")).toBeVisible();
    expect(screen.getByRole("link", { name: en.eventPractice.openActivity })).toHaveAttribute("href", "https://ezviet.org/challenges?practice=1");
    fireEvent.click(screen.getByText("Your participation", { exact: true }));
    fireEvent.change(screen.getByLabelText("Your participation"), { target: { value: "visiting" } });
    await waitFor(() => expect(transport).toHaveBeenCalledWith({ action: "participation", status: "visiting", expectedRevision: 1 }));
    expect(realFetch).not.toHaveBeenCalled();
  });
  it("explains an unavailable-table failure while preserving the last confirmed round", async () => {
    const host = { ...anonymous, canStart: true };
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => init?.method === "POST" ? { ok: false, status: 400, json: async () => ({ code: "invalid_table_capacity" }) } : { ok: true, json: async () => host });
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    fireEvent.click(await screen.findByRole("button", { name: "Draft next round" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en.eventPractice.notEnoughSeats);
    expect(screen.getByText(/Round 1 · Round countdown/)).toBeVisible();
  });
  it("keeps the reviewed next round unpublished until the host ends the current round", async () => {
    let current: PracticeView = { ...anonymous, canStart: true, groups: [[me, partner]] };
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const action = JSON.parse(init.body);
        if (action.action === "draft") current = { ...current, revision: 2, draft: { id: "next-draft", round: 2, minutes: 12, groups: [[me, partner]], assignments: [{ groupIndex: 0, tableNumber: 4, floor: "downstairs" }], rosterFingerprint: "current", createdAt: now } };
        if (action.action === "end") current = { ...current, revision: 3, round: { ...current.round!, endedAt: now, changeoverEndsAt: "2026-11-04T12:01:30.000Z" } };
        if (action.action === "start") current = { ...current, revision: 4, draft: null, round: { ...anonymous.round!, number: 2, assignments: [{ groupIndex: 0, tableNumber: 4, floor: "downstairs" }] } };
      }
      return { ok: true, json: async () => current };
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    fireEvent.click(await screen.findByRole("button", { name: "Draft next round" }));
    expect(await screen.findByRole("button", { name: "Start this round" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "End round" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start this round" })).toBeEnabled());
    expect(screen.getByText("1:30")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start this round" }));
    expect(await screen.findByText(/Round 2 · Round countdown/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start this round" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body).action)).toEqual(["draft", "end", "start"]);
  });
});
describe("authoritative round countdown", () => {
  it("uses the persisted deadline and holds a paused clock", () => {
    expect(remainingSeconds(anonymous.round, Date.parse(now) + 60_000)).toBe(660);
    expect(remainingSeconds({ ...anonymous.round!, pausedAt: now, remainingSeconds: 355 }, Date.parse(now) + 900_000)).toBe(355);
    expect(remainingSeconds({ ...anonymous.round!, endedAt: now }, Date.parse(now))).toBe(0);
  });
});
