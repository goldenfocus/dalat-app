"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { authContinuation } from "@/lib/auth/continuation";
import { normalizeLoginPhone } from "@/lib/auth/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PhoneAuthForm() {
  const t = useTranslations("auth.phone");
  const locale = useLocale();
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!retryAt) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function showError(err: { code?: string; status?: number }, verifying: boolean) {
    if (err.status === 429 || err.code?.includes("rate_limit")) {
      setRetryAt(Date.now() + 60_000);
      setError(t("rateLimited"));
    } else if (err.code === "phone_provider_disabled" || err.code === "sms_send_failed") {
      setError(t("unavailable"));
    } else {
      setError(t(verifying ? "invalidCode" : "sendFailed"));
    }
  }

  async function send() {
    if (inFlight.current || Date.now() < retryAt) return;
    const normalized = phone ?? normalizeLoginPhone(input);
    if (!normalized) { setError(t("invalidPhone")); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error: failure } = await createClient().auth.signInWithOtp({
        phone: normalized,
        options: { channel: "sms", data: { locale } },
      });
      if (failure) { showError(failure, false); return; }
      setPhone(normalized);
      setCode("");
      setRemaining(60);
      setRetryAt(Date.now() + 60_000);
    } catch {
      setError(t("sendFailed"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function verify() {
    if (!phone || inFlight.current) return;
    if (!/^\d{6}$/.test(code)) { setError(t("invalidCode")); return; }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { data, error: failure } = await createClient().auth.verifyOtp({
        phone, token: code, type: "sms",
      });
      if (failure) { showError(failure, true); return; }
      if (!data.session) { setError(t("invalidCode")); return; }
      window.location.assign(authContinuation(new URLSearchParams(window.location.search)));
    } catch {
      setError(t("invalidCode"));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void (phone ? verify() : send()); }}>
      {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      {phone ? <>
        <p className="text-sm" role="status">{t("sent", { phone })}</p>
        <div className="space-y-2">
          <Label htmlFor="phone-code">{t("code")}</Label>
          <Input id="phone-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
            autoFocus required disabled={busy} className="h-12 text-center tracking-[0.3em]" />
        </div>
        <Button className="w-full h-12" disabled={busy || code.length !== 6}>{t(busy ? "working" : "verify")}</Button>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" disabled={busy || remaining > 0} onClick={() => void send()}>
            {remaining > 0 ? t("resendIn", { seconds: remaining }) : t("resend")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setPhone(null); setCode(""); setError(null); }}>
            {t("change")}
          </Button>
        </div>
      </> : <>
        <div className="space-y-2">
          <Label htmlFor="login-phone">{t("number")}</Label>
          <Input id="login-phone" type="tel" autoComplete="tel" inputMode="tel" value={input}
            onChange={(event) => setInput(event.target.value)} placeholder="0912 345 678" required
            disabled={busy} aria-describedby="phone-help" className="h-12" />
          <p id="phone-help" className="text-xs text-muted-foreground">{t("help")}</p>
        </div>
        <Button className="w-full h-12" disabled={busy || remaining > 0}>
          {busy ? t("working") : remaining > 0 ? t("resendIn", { seconds: remaining }) : t("send")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("existing")}</p>
      </>}
    </form>
  );
}
