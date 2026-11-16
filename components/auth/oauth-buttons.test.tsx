import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthButtons } from "./oauth-buttons";
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("./email-auth-form", () => ({ EmailAuthForm: () => <div>Email form</div> }));
vi.mock("./phone-auth-form", () => ({ PhoneAuthForm: () => <div>Phone form</div> }));
vi.mock("./in-app-browser-warning", () => ({ InAppBrowserWarning: () => null }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("phone availability", () => {
  it("preserves email when phone auth is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { phone: false } }) }));
    render(<OAuthButtons />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText("Email form")).toBeInTheDocument();
    expect(screen.queryByText("Phone form")).toBeNull();
  });
  it("offers phone when the backend enables it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { phone: true } }) }));
    render(<OAuthButtons />);
    expect(await screen.findByText("Phone form")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "phone.useEmail" })).toBeInTheDocument();
  });
  it("preserves email if settings cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<OAuthButtons />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByText("Email form")).toBeInTheDocument();
  });
});
