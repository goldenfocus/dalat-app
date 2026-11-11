"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/lib/i18n/routing";
import { callbackUrl, safeReturnPath } from "@/lib/auth/continuation";
import { createClient } from "@/lib/supabase/client";

/**
 * Optional, after the door: a guest turns the check-in they already hold into
 * an account. Both paths return to this page, where the arrival API attaches
 * the existing check-in to the new session. Nothing here blocks arrival.
 */
export function SaveAccountCard() {
  const t = useTranslations("arrival");
  const next = safeReturnPath(usePathname());
  const [connecting, setConnecting] = useState(false);
  const [failed, setFailed] = useState(false);

  const google = async () => {
    if (connecting) return;
    setConnecting(true); setFailed(false);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl(window.location.origin, new URLSearchParams({ next })), queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
    } catch { setFailed(true); setConnecting(false); }
  };

  return <section aria-labelledby="save-account-title" className="space-y-4 rounded-xl border border-border p-4">
    <div>
      <h2 id="save-account-title" className="text-lg font-semibold text-foreground">{t("saveAccountTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("saveAccountPitch")}</p>
    </div>
    <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
      <li>{t("saveAccountSpot")}</li>
      <li>{t("saveAccountPhotos")}</li>
      <li>{t("saveAccountDrink")}</li>
    </ul>
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={connecting} onClick={() => void google()} className="min-h-12 w-full justify-center text-base">
        {!connecting && <svg viewBox="0 0 24 24" aria-hidden="true" className="mr-2 h-5 w-5">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>}
        {t(connecting ? "saveAccountConnecting" : "saveAccountGoogle")}
      </Button>
      <Button asChild variant="ghost" className="min-h-12 w-full justify-center text-base">
        <Link href={`/auth/login?next=${encodeURIComponent(next)}`}><Mail aria-hidden="true" className="mr-2 h-5 w-5" />{t("saveAccountEmail")}</Link>
      </Button>
    </div>
    {failed && <p role="alert" className="text-sm text-destructive">{t("saveAccountError")}</p>}
    <p className="text-xs text-muted-foreground">{t("saveAccountLater")}</p>
  </section>;
}
