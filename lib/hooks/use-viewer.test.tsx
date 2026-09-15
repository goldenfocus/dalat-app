import { act, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types";
import { enterGodMode, exitGodMode, refreshViewer } from "./use-viewer";

import { AuthButtonClient } from "@/components/auth-button-client";
import { GodModeIndicatorWrapper } from "@/components/god-mode-indicator";
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/i18n/routing", () => ({ Link: "a" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/user-menu", () => ({ UserMenu: ({ avatarUrl }: { avatarUrl: string }) => <img alt="avatar" src={avatarUrl} /> }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
} }) }));
const admin = { id: "admin", display_name: "Admin", avatar_url: "admin.jpg" } as Profile;
const target = { id: "target", display_name: "Target", avatar_url: "target.jpg" } as Profile;
function Chrome() {
  return <><AuthButtonClient /><GodModeIndicatorWrapper /></>;
}
function response(profile: Profile | null, isActive = false) {
  return { ok: true, json: async () => ({ profile, isActive }) };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("switches the avatar and banner together, clears on successful exit, and ignores an old response", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(admin));
  vi.stubGlobal("fetch", fetcher);
  render(<Chrome />);
  await waitFor(() => expect(screen.getByAltText("avatar")).toHaveAttribute("src", "admin.jpg"));
  let resolveOld!: (value: unknown) => void;
  fetcher.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = refreshViewer(); enterGodMode(target); });
  expect(screen.getByAltText("avatar")).toHaveAttribute("src", "target.jpg");
  expect(screen.getByText("Target", { selector: "strong" })).toBeInTheDocument();
  await act(async () => { resolveOld(response(admin)); await pending; });
  expect(screen.getByText("Target", { selector: "strong" })).toBeInTheDocument();
  // Leave the background refresh unresolved: removal must not wait for it.
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ restored: true, profile: admin }) }).mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => { await exitGodMode(); });
  expect(screen.queryByText("Target", { selector: "strong" })).not.toBeInTheDocument();
  expect(screen.getByAltText("avatar")).toHaveAttribute("src", "admin.jpg");
});

it("keeps impersonation visible when exit fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(target, true)));
  render(<Chrome />);
  await waitFor(() => expect(screen.getByText("Target", { selector: "strong" })).toBeInTheDocument());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(exitGodMode()).rejects.toThrow("Failed to restore admin session");
  expect(screen.getByText("Target", { selector: "strong" })).toBeInTheDocument();
});

it("deduplicates simultaneous exit clicks and restores the returned admin profile after a reload", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(target, true)));
  render(<Chrome />);
  await waitFor(() => expect(screen.getByText("Target", { selector: "strong" })).toBeInTheDocument());
  let complete!: (value: unknown) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }))
    .mockResolvedValue(response(admin));
  vi.stubGlobal("fetch", fetcher);
  const first = exitGodMode();
  const second = exitGodMode();
  expect(first).toBe(second);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    complete({ ok: true, json: async () => ({ restored: true, profile: admin }) });
    await first;
  });
  expect(screen.queryByText("Target", { selector: "strong" })).not.toBeInTheDocument();
  expect(screen.getByAltText("avatar")).toHaveAttribute("src", "admin.jpg");
});
