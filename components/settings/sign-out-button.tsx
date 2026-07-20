"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { routing } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";

// signOut() waits on a network POST to /auth/v1/logout and on a navigator.locks
// handle shared across tabs. Either can stall, which left the button spinning
// forever with no way out. Cap the wait and leave regardless.
const SIGN_OUT_TIMEOUT_MS = 3000;

export function SignOutButton() {
  const t = useTranslations("userMenu");
  const locale = useLocale();
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, SIGN_OUT_TIMEOUT_MS)),
      ]);
    } finally {
      // Hard navigation, not router.push: every server component we came from was
      // rendered with the old session, and Next's client router cache would happily
      // serve them back. A full load rebuilds the tree with no cookies.
      window.location.href = locale === routing.defaultLocale ? "/" : `/${locale}`;
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSignOut}
      disabled={isLoading}
      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4 mr-2" />
      )}
      {t("signOut")}
    </Button>
  );
}
