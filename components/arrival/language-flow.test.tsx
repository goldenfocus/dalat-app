import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { GuestArrival } from "./guest-arrival";
import { useRsvpLanguages } from "./use-rsvp-languages";

vi.mock("./staff-desk-entry", () => ({ StaffDeskEntry: () => null }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
const preferences = { practiceLanguage: "vietnamese", englishLevel: "native", vietnameseLevel: "starting" };
const context = { event: { title: "Language Exchange @ Social House", isOpen: true, orderingEnabled: false, startsAt: "2026-10-28T12:00:00Z" }, profile: { name: "Chico" }, preferences, menu: [], receipt: null };
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
function wrap(node: React.ReactNode) { return render(<NextIntlClientProvider locale="en" messages={messages}>{node}</NextIntlClientProvider>); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("compact language exchange flow", () => {
  it("reuses the account name and saved levels at check-in without a questionnaire", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(context)).mockResolvedValueOnce(json({ participant: { id: "12345678", nickname: "Chico", checked_in_at: "2026-10-28T12:00:00Z" }, order: null }));
    vi.stubGlobal("fetch", fetcher);
    wrap(<GuestArrival slug="social-house" />);
    const checkIn = await screen.findByRole("button", { name: "Check in" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(checkIn);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ nickname: "Chico", ...preferences, items: [] });
    expect(await screen.findByText("You’re checked in")).toBeInTheDocument();
  });

  it("asks an older RSVP only for missing languages and saves before advancing", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ ...context, preferences: null })).mockResolvedValue(json({ preferences }));
    vi.stubGlobal("fetch", fetcher);
    wrap(<GuestArrival slug="social-house" />);
    await screen.findByRole("heading", { name: "Language practice" });
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
    fireEvent.change(screen.getByLabelText("Your English"), { target: { value: "native" } });
    fireEvent.change(screen.getByLabelText("Your Vietnamese"), { target: { value: "starting" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("button", { name: "Check in" });
    expect(fetcher.mock.calls[1][0]).toContain("/arrival/preferences");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(preferences);
  });

  it("keeps walk-in name entry alongside compact language dropdowns", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...context, profile: null, preferences: null })));
    wrap(<GuestArrival slug="social-house" />);
    expect(await screen.findByLabelText("Your name or nickname")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByLabelText("Your English").querySelectorAll("option")).toHaveLength(7);
    expect(screen.queryByText("Step 1 of 3")).toBeNull();
  });
});

function RsvpHarness({ proceed }: { proceed: () => Promise<void> }) {
  const { beforeRsvp, languageSheet } = useRsvpLanguages("social-house");
  return <><button onClick={() => void beforeRsvp(proceed)}>RSVP</button>{languageSheet}</>;
}

describe("RSVP language capture", () => {
  it("saves preferences before RSVP and preserves answers on a failed save", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ preferences: null })).mockResolvedValueOnce(json({}, false)).mockResolvedValueOnce(json({ preferences }));
    vi.stubGlobal("fetch", fetcher);
    const proceed = vi.fn().mockResolvedValue(undefined);
    wrap(<RsvpHarness proceed={proceed} />);
    fireEvent.click(screen.getByText("RSVP"));
    await screen.findByRole("dialog");
    expect(proceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
    fireEvent.change(screen.getByLabelText("Your English"), { target: { value: "native" } });
    fireEvent.change(screen.getByLabelText("Your Vietnamese"), { target: { value: "starting" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm RSVP" }));
    await screen.findByRole("alert");
    expect(proceed).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Your English")).toHaveValue("native");
    fireEvent.click(screen.getByRole("button", { name: "Confirm RSVP" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(preferences);
  });

  it("continues directly when preferences already exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ preferences })));
    const proceed = vi.fn().mockResolvedValue(undefined);
    wrap(<RsvpHarness proceed={proceed} />);
    await act(async () => { fireEvent.click(screen.getByText("RSVP")); });
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
