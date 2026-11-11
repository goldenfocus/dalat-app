import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArrivalReceiptView } from "./arrival-receipt";
import { SaveAccountCard } from "./save-account-card";
import type { ArrivalReceipt } from "@/lib/arrival/types";

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }));
vi.mock("@/lib/i18n/routing", () => ({
  usePathname: () => "/events/exchange-20261111/arrive",
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithOAuth } }) }));

const participant = { id: "0f3c9a1e-0000-4000-8000-000000000001", event_id: "e1", user_id: null, nickname: "Linh", practice_language: "english" as const, english_level: null, vietnamese_level: null, checked_in_at: "2026-11-11T11:00:00Z" };
const receipt = (userId: string | null): ArrivalReceipt => ({ participant: { ...participant, user_id: userId }, order: null });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("save account after a guest check-in", () => {
  it("offers Google and email to a guest, both returning to this arrival page", async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    render(<SaveAccountCard />);
    expect(screen.getByRole("heading", { name: "saveAccountTitle" })).toBeVisible();
    expect(screen.getByRole("link", { name: "saveAccountEmail" })).toHaveAttribute("href", "/auth/login?next=%2Fevents%2Fexchange-20261111%2Farrive");
    fireEvent.click(screen.getByRole("button", { name: "saveAccountGoogle" }));
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1));
    const { provider, options } = signInWithOAuth.mock.calls[0][0];
    expect(provider).toBe("google");
    const redirect = new URL(options.redirectTo);
    expect(redirect.origin + redirect.pathname).toBe(`${window.location.origin}/auth/callback`);
    expect(redirect.searchParams.get("next")).toBe("/auth/continue?next=%2Fevents%2Fexchange-20261111%2Farrive");
  });

  it("is rendered by the guest page, not by the shared receipt view", () => {
    render(<ArrivalReceiptView receipt={receipt(null)} stale={false} onRefresh={() => {}} />);
    expect(screen.queryByRole("heading", { name: "saveAccountTitle" })).toBeNull();
    expect(screen.getByText("welcomeName")).toBeVisible();
  });

  it("recovers with a visible error when Google sign-in cannot start", async () => {
    signInWithOAuth.mockResolvedValue({ error: new Error("blocked") });
    render(<SaveAccountCard />);
    fireEvent.click(screen.getByRole("button", { name: "saveAccountGoogle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("saveAccountError");
    expect(screen.getByRole("button", { name: "saveAccountGoogle" })).toBeEnabled();
  });
});
