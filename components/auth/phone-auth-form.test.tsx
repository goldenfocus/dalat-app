import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneAuthForm } from "./phone-auth-form";
import { normalizeLoginPhone } from "@/lib/auth/phone";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "vi",
  useTranslations: () => (key: string, args?: Record<string, unknown>) => key + (args ? JSON.stringify(args) : ""),
}));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("Vietnam-friendly phone numbers", () => {
  it.each(["0912 345 678", "912345678", "84912345678", "+84 912 345 678"])("normalizes %s", (phone) => {
    expect(normalizeLoginPhone(phone)).toBe("+84912345678");
  });
  it.each(["", "abc0912345678", "+840912345678", "012345", "091234567890"])("rejects %s", (phone) => {
    expect(normalizeLoginPhone(phone)).toBeNull();
  });
  it("preserves an international number", () => {
    expect(normalizeLoginPhone("+1 (514) 555-0123")).toBe("+15145550123");
  });
});

describe("SMS sign-in", () => {
  it("requests SMS with locale, locks resend, and verifies the exact phone number", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    render(<PhoneAuthForm />);
    fireEvent.change(screen.getByLabelText("number"), { target: { value: "0912 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    await screen.findByLabelText("code");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+84912345678", options: { channel: "sms", data: { locale: "vi" } },
    });
    expect(screen.getByRole("button", { name: /resendIn/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "verify" }));
    await waitFor(() => expect(auth.verifyOtp).toHaveBeenCalledWith({
      phone: "+84912345678", token: "123456", type: "sms",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalidCode");
  });
  it("shows a delivery error without claiming a code was sent", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: "phone_provider_disabled" } });
    render(<PhoneAuthForm />);
    fireEvent.change(screen.getByLabelText("number"), { target: { value: "0912345678" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByLabelText("code")).toBeNull();
  });
  it("does not send malformed numbers", async () => {
    render(<PhoneAuthForm />);
    fireEvent.change(screen.getByLabelText("number"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalidPhone");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });
});
