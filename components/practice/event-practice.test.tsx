import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type { PracticeView } from "@/lib/practice/model";
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof en.eventPractice, args: Record<string, unknown> = {}) => Object.entries(args).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), en.eventPractice[key]) }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: null }) }));
import { EventPractice } from "./event-practice";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const anonymous: PracticeView = { canStart: false, count: 32, me: null, round: { number: 1, startedAt: new Date().toISOString(), minutes: 10, groups: [] }, groups: [], myGroup: [], myGroupNumber: null };
describe("event pairing visibility", () => {
  it("offers receipt recovery instead of hiding the entire panel for an unrecognized browser", async () => {
    const me = { id: "me", name: "Mai", learns: "en", speaks: ["vi"] };
    const partner = { id: "partner", name: "Alex", learns: "vi", speaks: ["en"] };
    const found: PracticeView = { ...anonymous, me, groups: [[me, partner]], myGroup: [me, partner], myGroupNumber: 7 };
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? found : anonymous }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EventPractice slug="test" />);
    expect(await screen.findByRole("heading", { name: "Find your partner" })).toBeVisible();
    fireEvent.change(await screen.findByLabelText("Check-in code"), { target: { value: "12abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Show my partner" }));
    expect(await screen.findByRole("heading", { name: "Your partner" })).toBeVisible();
    expect(screen.getByText("Alex")).toBeVisible();
    expect(screen.getByText("You: Mai")).toBeVisible();
    expect(screen.getByText("Group 7")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start practice" })).toBeNull();
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.body?.includes('"action":"find"'))).toBe(true));
  });
  it("clearly tells an already checked-in late arrival they are waiting for the next round", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...anonymous, me: { id: "late", name: "Late guest", learns: "en", speaks: [] } }) }));
    render(<EventPractice slug="test" />);
    expect(await screen.findByText("You’re checked in. The host will include you in the next round.")).toBeVisible();
    expect(screen.queryByLabelText("Check-in code")).toBeNull();
  });
});
