import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { UserMenu } from "./user-menu";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/loyalty/tier-badge", () => ({ TierBadge: () => null }));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return { DropdownMenu: Wrapper, DropdownMenuContent: Wrapper, DropdownMenuItem: Wrapper,
    DropdownMenuSeparator: () => <hr />, DropdownMenuTrigger: Wrapper };
});
const props = { avatarUrl: null, displayName: "Vi", username: "vivian", role: "user" as const };
let events: { slug: string }[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  events = [];
  fetchMock = vi.fn().mockImplementation(async (url: string) => ({
    ok: true, json: async () => url === "/api/arrival/staff" ? { events } : {},
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("user menu staff discovery", () => {
  it("shows an assigned God-mode target the same direct staff link as a normal session", async () => {
    events = [{ slug: "language-exchange" }];
    render(<UserMenu {...props} isGodMode />);
    expect(await screen.findByRole("link", { name: "staffDesk" })).toHaveAttribute("href", "/events/language-exchange/host");
    expect(fetchMock).toHaveBeenCalledWith("/api/arrival/staff", expect.objectContaining({ cache: "no-store" }));
  });
  it("does not show the desk to an ordinary user without assignments", async () => {
    render(<UserMenu {...props} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/arrival/staff", expect.anything()));
    expect(screen.queryByRole("link", { name: "staffDesk" })).toBeNull();
  });
  it("opens the private list when staff work at multiple events", async () => {
    events = [{ slug: "first" }, { slug: "second" }];
    render(<UserMenu {...props} />);
    expect(await screen.findByRole("link", { name: "staffDesk" })).toHaveAttribute("href", "/staff");
  });
  it("hides the previous target's desk immediately when the viewer changes", async () => {
    events = [{ slug: "first" }];
    const view = render(<UserMenu {...props} isGodMode />);
    await screen.findByRole("link", { name: "staffDesk" });
    events = [];
    view.rerender(<UserMenu {...props} username="someone-else" isGodMode />);
    expect(screen.queryByRole("link", { name: "staffDesk" })).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("link", { name: "staffDesk" })).toBeNull();
  });
});
