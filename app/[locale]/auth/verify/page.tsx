"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";

function VerifyContent() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // Get token_hash and type from params (bypasses PKCE for PWA compatibility)
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") || "magiclink";

  const handleConfirm = () => {
    if (!tokenHash) return;
    setIsLoading(true);
    // Redirect to localized /auth/confirm which uses verifyOtp() - no PKCE required
    window.location.href = `/${locale}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}`;
  };

  if (!tokenHash) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{t("verifyInvalidTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t("verifyInvalidDescription")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t("verifyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("verifyDescription")}
            </p>
            <Button
              onClick={handleConfirm}
              className="w-full h-12"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("verifyConfirming")}
                </>
              ) : (
                t("verifyButton")
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {t("verifyHint")}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
