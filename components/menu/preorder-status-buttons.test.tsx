import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreorderStatusButtons } from "./preorder-status-buttons";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/i18n/routing", () => ({ Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

const props = { id: "order", eventSlug: "exchange", status: "pending" as const, readyForPreparation: true };
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }); });
afterEach(cleanup);

describe("preorder fulfillment", () => {
  it("offers check-in instead of actions the server rejects for a reservation", () => {
    render(<PreorderStatusButtons {...props} readyForPreparation={false} />);
    expect(screen.getByText("sponsorWaitForCheckIn")).toBeVisible();
    expect(screen.getByRole("link", { name: "viewHost" })).toHaveAttribute("href", "/events/exchange/host");
    expect(screen.queryByRole("button", { name: "markConfirmed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "markFulfilled" })).toBeNull();
    expect(screen.getByRole("button", { name: "cancelPreorder" })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("marks a checked-in order served and refreshes its status", async () => {
    render(<PreorderStatusButtons {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "markFulfilled" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("set_preorder_status", { p_preorder_id: "order", p_status: "fulfilled" });
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("explains a stale arrival gate and refreshes the available actions", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "arrival_required" } });
    render(<PreorderStatusButtons {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "markFulfilled" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("sponsorWaitForCheckIn"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("re-enables retry after a network failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    render(<PreorderStatusButtons {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "markFulfilled" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("errorGeneric"));
    expect(screen.getByRole("button", { name: "markFulfilled" })).toBeEnabled();
  });

  it("does not offer further actions on a served order", () => {
    render(<PreorderStatusButtons {...props} status="fulfilled" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
