import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeLanguageChoices } from "@/lib/arrival/legacy-languages";
import { arrivalSchema } from "@/lib/arrival/schema";
import { GuestArrival } from "./guest-arrival";
import { QUICK_SPEAKS, QuickLanguage, quickLanguageChoices } from "./quick-language";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string, args?: { name?: string }) => `${key}${args?.name ? ` ${args.name}` : ""}` }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: null, isGodMode: false }) }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("./staff-desk-entry", () => ({ StaffDeskEntry: () => null }));
vi.mock("@/components/practice/event-practice", () => ({ EventPractice: () => null }));
// The optional account card after check-in has its own tests and needs auth routing.
vi.mock("./save-account-card", () => ({ SaveAccountCard: () => null }));

const context = { event: { id: "event", slug: "exchange", title: "Exchange", venueName: "Cafe", startsAt: "2026-10-28T11:00:00Z", isOpen: true, orderingEnabled: false }, profile: null, rsvpStatus: null, receipt: null, access: { canWelcome: false, canOrder: false, canManage: false }, menu: [] };
const receipt = { participant: { id: "12345678-aaaa", nickname: "Lan", checked_in_at: "2026-10-28T11:00:00Z", user_id: null }, order: null };
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
const calls = (fetcher: ReturnType<typeof vi.fn>, method: string) => fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("quickLanguageChoices", () => {
  it("maps one door answer onto the legacy fields the arrival API requires", () => {
    expect(quickLanguageChoices("vietnamese")).toEqual({ practiceLanguage: "english", vietnameseLevel: "native", englishLevel: "some" });
    expect(quickLanguageChoices("english")).toEqual({ practiceLanguage: "vietnamese", englishLevel: "fluent", vietnameseLevel: "starting" });
    expect(quickLanguageChoices("other")).toEqual({ practiceLanguage: "both", englishLevel: "comfortable", vietnameseLevel: "starting" });
  });

  it("always produces a complete, schema-valid check-in payload", () => {
    for (const speaks of QUICK_SPEAKS) {
      const choices = quickLanguageChoices(speaks);
      expect(completeLanguageChoices(choices)).toBe(true);
      expect(arrivalSchema.safeParse({ requestId: "11111111-1111-4111-8111-111111111111", nickname: "Lan", ...choices, items: [], note: "" }).success).toBe(true);
    }
  });
});

describe("QuickLanguage", () => {
  it("offers three large choices, keeps endonyms literal and translates Other", () => {
    const onChange = vi.fn();
    render(<QuickLanguage value="english" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "quickSpeak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiếng Việt" })).toHaveAttribute("lang", "vi");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "quickOther" }));
    expect(onChange).toHaveBeenCalledWith("other");
  });
});

describe("one-screen guest check-in", () => {
  it("checks a walk-in in from a single screen with a name and one language tap", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === "POST" ? receipt : context));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestArrival slug="exchange" />);
    const name = await screen.findByLabelText("nickname");
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.queryByRole("combobox")).toBeNull();
    const submit = screen.getByRole("button", { name: "checkIn" });
    expect(submit).toBeDisabled();
    fireEvent.change(name, { target: { value: " Lan " } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tiếng Việt" }));
    fireEvent.click(submit);
    expect(await screen.findByText("welcomeName Lan")).toBeInTheDocument();
    const posts = calls(fetcher, "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/events/exchange/arrival?locale=en");
    const payload = JSON.parse((posts[0][1] as RequestInit).body as string);
    expect(payload).toMatchObject({ nickname: "Lan", practiceLanguage: "english", vietnameseLevel: "native", englishLevel: "some", items: [], note: "" });
    expect(payload).not.toHaveProperty("doorKey");
    expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends the door key from the QR link and reuses the request ID when retrying", async () => {
    window.history.replaceState(null, "", "/events/exchange/arrive?door=abc123DEF");
    let attempts = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "POST" ? (++attempts === 1 ? json({ code: "unavailable" }, false) : json(receipt)) : json(context));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestArrival slug="exchange" />);
    fireEvent.change(await screen.findByLabelText("nickname"), { target: { value: "Tom" } });
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("nickname")).toHaveValue("Tom");
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    await screen.findByText("welcomeName Lan");
    const [first, second] = calls(fetcher, "POST").map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(first).toMatchObject({ nickname: "Tom", practiceLanguage: "vietnamese", englishLevel: "fluent", vietnameseLevel: "starting", doorKey: "abc123DEF" });
    expect(second).toEqual(first);
    // The check-in already carried the key, so no separate door confirmation is sent.
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/arrival/door"))).toBe(false);
  });

  it("ignores a malformed door parameter", async () => {
    window.history.replaceState(null, "", "/events/exchange/arrive?door=%3Cscript%3E");
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => json(init?.method === "POST" ? receipt : context));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestArrival slug="exchange" />);
    fireEvent.change(await screen.findByLabelText("nickname"), { target: { value: "Tom" } });
    fireEvent.click(screen.getByRole("button", { name: "quickOther" }));
    fireEvent.click(screen.getByRole("button", { name: "checkIn" }));
    await screen.findByText("welcomeName Lan");
    const payload = JSON.parse((calls(fetcher, "POST")[0][1] as RequestInit).body as string);
    expect(payload).toMatchObject({ practiceLanguage: "both", englishLevel: "comfortable", vietnameseLevel: "starting" });
    expect(payload).not.toHaveProperty("doorKey");
  });

  it("confirms presence once when an existing receipt is opened through the door QR", async () => {
    window.history.replaceState(null, "", "/events/exchange/arrive?door=abc123");
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => String(url).endsWith("/arrival/door") ? Promise.reject(new Error("offline")) : json({ ...context, receipt }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestArrival slug="exchange" />);
    expect(await screen.findByText("welcomeName Lan")).toBeInTheDocument();
    const door = fetcher.mock.calls.filter(([url]) => String(url).endsWith("/arrival/door"));
    expect(door).toHaveLength(1);
    expect(door[0][0]).toBe("/api/events/exchange/arrival/door");
    expect(door[0][1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doorKey: "abc123" }) });
  });

  it("does not confirm presence for an existing receipt without the door key", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json({ ...context, receipt }));
    vi.stubGlobal("fetch", fetcher);
    render(<GuestArrival slug="exchange" />);
    await screen.findByText("welcomeName Lan");
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/arrival/door"))).toBe(false);
  });
});
