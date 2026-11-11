import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
import { EventArrivalCard } from "./event-arrival-card";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows a saved check-in on return to the event rather than asking again", async () => {
 let checkedIn = false;
 vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ checkedIn }) })));
 render(<EventArrivalCard slug="exchange" />);
 expect(await screen.findByRole("link", { name: "checkIn" })).toBeInTheDocument();
 checkedIn = true;
 fireEvent(window, new Event("pageshow"));
 expect(await screen.findByRole("link", { name: "checkedIn" })).toHaveAttribute("href", "/events/exchange/arrive");
 expect(screen.queryByRole("link", { name: "checkIn" })).toBeNull();
});
it("never presents a failed attendance lookup as not checked in", async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal("fetch", fetcher);
 render(<EventArrivalCard slug="exchange" />);
 expect(await screen.findByRole("button", { name: "retry" })).toBeInTheDocument();
 expect(screen.queryByRole("link", { name: "checkIn" })).toBeNull();
 fetcher.mockResolvedValue({ ok: true, json: async () => ({ checkedIn: true }) });
 fireEvent.click(screen.getByRole("button", { name: "retry" }));
 await waitFor(() => expect(screen.getByRole("link", { name: "checkedIn" })).toBeInTheDocument());
});
