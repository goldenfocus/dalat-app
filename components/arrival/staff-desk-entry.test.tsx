import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffDeskEntry } from "./staff-desk-entry";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const viewer = vi.hoisted(() => ({ id: "staff" as string | undefined }));
vi.mock("@/lib/hooks/use-viewer", () => ({ useViewer: () => ({ profile: viewer.id ? { id: viewer.id } : null }) }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); viewer.id = "staff"; });
const allowed = { canWelcome: true, canOrder: true, canManage: true };
const denied = { canWelcome: false, canOrder: false, canManage: false };

describe("staff desk discovery", () => {
  it("shows an assigned manager a prominent direct desk link even when guest check-in is closed", () => {
    render(<StaffDeskEntry slug="exchange" access={allowed} />);
    expect(screen.getByRole("link", { name: /staffDesk/ })).toHaveAttribute("href", "/events/exchange/host");
    expect(screen.getByText("hostArrivals · hostOrders · hostTeam")).toBeVisible();
  });
  it("hides the staff entry from guests", () => {
    render(<StaffDeskEntry slug="exchange" access={denied} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("checks the signed-in session privately before exposing a cached event's staff link", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => allowed });
    vi.stubGlobal("fetch", fetchMock);
    render(<StaffDeskEntry slug="exchange" />);
    expect(await screen.findByRole("link", { name: /staffDesk/ })).toHaveAttribute("href", "/events/exchange/host");
    expect(fetchMock).toHaveBeenCalledWith("/api/events/exchange/arrival/access", expect.objectContaining({ cache: "no-store" }));
  });
  it("does not show a desk if permission lookup fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<StaffDeskEntry slug="exchange" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("immediately hides the old staff link when the signed-in identity changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => allowed }));
    const view = render(<StaffDeskEntry slug="exchange" />);
    await screen.findByRole("link", { name: /staffDesk/ });
    viewer.id = undefined;
    view.rerender(<StaffDeskEntry slug="exchange" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
