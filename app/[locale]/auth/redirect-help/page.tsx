"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coffee, RefreshCw, Globe, Cookie } from "lucide-react";

const quotes = [
  { text: "The best view comes after the hardest climb.", origin: "Somewhere on Langbiang Peak" },
  { text: "Even the fog lifts eventually.", origin: "Dalat mornings" },
  { text: "A good cup of coffee fixes most things.", origin: "Every cafe in Dalat" },
  { text: "Not all who wander are lost — some just need to clear their cookies.", origin: "Ancient internet proverb" },
  { text: "The flowers don't rush to bloom. Take a breath.", origin: "Dalat Flower Garden" },
  { text: "Every redirect loop has an exit.", origin: "Optimistic developers" },
  { text: "In Dalat, even the rain is beautiful.", origin: "Rainy season wisdom" },
  { text: "The journey of a thousand pages begins with a single click.", origin: "Web philosophy" },
];

export default function RedirectHelpPage() {
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)]);
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
            <h1 className="text-2xl font-bold">Got a little lost</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Your browser and our server got stuck in a loop. It happens — let&apos;s sort it out.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Cookie warning */}
            {!cookiesEnabled && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                <div className="flex items-start gap-2">
                  <Cookie className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-500">Cookies are blocked</p>
                    <p className="text-muted-foreground mt-1">
                      We need cookies to keep you signed in. Enable them for dalat.app and try again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Quick fixes */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Quick fixes:</p>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">1.</span>
                  <span><strong>Clear cookies</strong> for dalat.app and try again (button below does this)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">2.</span>
                  <span>Try a <strong>different browser</strong> (Chrome, Safari, or Edge)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-base leading-5">3.</span>
                  <span>If using <strong>Firefox</strong>, check that cookies aren&apos;t blocked for this site</span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleClearAndRetry} className="w-full h-12 gap-2">
                <RefreshCw className="h-4 w-4" />
                Clear cookies &amp; start fresh
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 gap-2"
                onClick={() => window.open("https://dalat.app", "_blank")}
              >
                <Globe className="h-4 w-4" />
                Open in new tab
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feel-good quote */}
        <div className="text-center px-4">
          <p className="text-sm italic text-muted-foreground">&ldquo;{quote.text}&rdquo;</p>
          <p className="text-xs text-muted-foreground/60 mt-1">— {quote.origin}</p>
        </div>
      </div>
    </div>
  );
}
