"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coffee, RefreshCw, Globe, Cookie } from "lucide-react";
import { useTranslations } from "next-intl";

const QUOTE_COUNT = 8;

export default function RedirectHelpPage() {
  const t = useTranslations("auth.redirectHelp");
  const [quoteIndex] = useState(() => Math.floor(Math.random() * QUOTE_COUNT) + 1);
  const [cookiesEnabled, setCookiesEnabled] = useState(true);

  useEffect(() => {
    // Test if cookies are enabled
    try {
      document.cookie = "_test=1; max-age=1; path=/; SameSite=Lax";
      setCookiesEnabled(document.cookie.includes("_test=1"));
    } catch {
      setCookiesEnabled(false);
    }
  }, []);

  const handleClearAndRetry = () => {
    // Clear dalat-related cookies
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md flex flex-col gap-6">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <Coffee className="h-8 w-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("description")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cookie warning */}
            {!cookiesEnabled && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <div className="flex items-start gap-2">
                  <Cookie className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-500">{t("cookiesBlockedTitle")}</p>
                    <p className="text-muted-foreground mt-1">
                      {t("cookiesBlockedDescription")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick fixes */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("quickFixes")}</p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">1.</span>
                  <span>{t.rich("fix1", { strong: (chunks) => <strong>{chunks}</strong> })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">2.</span>
                  <span>{t.rich("fix2", { strong: (chunks) => <strong>{chunks}</strong> })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">3.</span>
                  <span>{t.rich("fix3", { strong: (chunks) => <strong>{chunks}</strong> })}</span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleClearAndRetry} className="w-full h-12 gap-2">
                <RefreshCw className="h-4 w-4" />
                {t("clearAndRetry")}
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 gap-2"
                onClick={() => window.open("https://dalat.app", "_blank")}
              >
                <Globe className="h-4 w-4" />
                {t("openInNewTab")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feel-good quote */}
        <div className="text-center px-4">
          <p className="text-sm italic text-muted-foreground">&ldquo;{t(`quote${quoteIndex}.text`)}&rdquo;</p>
          <p className="text-xs text-muted-foreground/60 mt-1">— {t(`quote${quoteIndex}.origin`)}</p>
        </div>
      </div>
    </div>
  );
}
