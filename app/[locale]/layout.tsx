import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { getMessages, setRequestLocale } from "next-intl/server";
import { GlobalFooter } from "@/components/global-footer";
import { ScrollRestorationProvider } from "@/lib/contexts/scroll-restoration-context";
import { routing, buildLocales, type Locale } from "@/lib/i18n/routing";
import { CORE_CLIENT_NAMESPACES } from "@/lib/i18n/client-namespaces";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { QueryProvider } from "@/lib/providers/query-provider";
import { LocalePreloader } from "@/components/locale-preloader";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProgressiveIntlProvider } from "@/components/progressive-intl-provider";
import {
  DeferredBadgeClearer,
  DeferredGodModeIndicator,
  DeferredHeartbeat,
  DeferredInstallAppBanner,
  DeferredLocaleMismatchBanner,
  DeferredMiniPlayer,
  DeferredNotificationPrompt,
  DeferredPerformanceMonitor,
  DeferredSwUpdateHandler,
  DeferredUploadFAB,
} from "@/components/deferred-chrome";

const siteUrl = "https://dalat.app";

// Chrome-only progressive enhancement; other browsers ignore the script.
// Event links come in both shapes: /events/<slug> (default locale, unprefixed
// via localePrefix: 'as-needed') and /<locale>/events/<slug>.
const speculationRules = JSON.stringify({
  prerender: [
    { where: { href_matches: ["/events/*", "/*/events/*"] }, eagerness: "moderate" },
  ],
  prefetch: [{ where: { href_matches: "/*" }, eagerness: "conservative" }],
});

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

// Prerender only buildLocales; the rest render on-demand via ISR
export function generateStaticParams() {
  return buildLocales.map((locale) => ({ locale }));
}

// Generate metadata with hreflang for all 12 locales (SEO)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;

  return {
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        // The Global Twelve — 'en' is the default locale and lives at the
        // root (localePrefix: 'as-needed'); /en 307-redirects, which Google
        // treats as a broken alternate.
        'en': siteUrl,
        'vi': `${siteUrl}/vi`,
        'ko': `${siteUrl}/ko`,
        'zh': `${siteUrl}/zh`,
        'ru': `${siteUrl}/ru`,
        'fr': `${siteUrl}/fr`,
        'ja': `${siteUrl}/ja`,
        'ms': `${siteUrl}/ms`,
        'th': `${siteUrl}/th`,
        'de': `${siteUrl}/de`,
        'es': `${siteUrl}/es`,
        'id': `${siteUrl}/id`,
        'x-default': siteUrl,
      },
    },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Ship only shell/homepage namespaces in the first RSC payload.
  // ProgressiveIntlProvider loads the rest after paint (see CORE_CLIENT_NAMESPACES).
  // Full CLIENT_NAMESPACES list still enforced by scripts/check-client-namespaces.mjs.
  const messages = await getMessages();
  const coreMessages = Object.fromEntries(
    CORE_CLIENT_NAMESPACES.filter((ns) => {
      if (ns in messages) return true;
      console.error(
        `[layout] core client namespace "${ns}" missing from "${locale}" messages — shell will crash`
      );
      return false;
    }).map((ns) => [ns, messages[ns as keyof typeof messages]])
  );

  return (
    <ProgressiveIntlProvider locale={locale as Locale} coreMessages={coreMessages}>
      <script
        type="speculationrules"
        dangerouslySetInnerHTML={{ __html: speculationRules }}
      />
      <QueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark", "midnight", "forest", "hydrangea", "golden", "coffee", "misty", "rose", "system"]}
        >
          <ScrollRestorationProvider>
            <Toaster
              position="top-center"
              closeButton
              toastOptions={{
                className: "font-sans",
                style: {
                  background: "hsl(var(--background))",
                  color: "hsl(var(--foreground))",
                  border: "1px solid hsl(var(--border))",
                },
              }}
            />
            <LocalePreloader />
            <div className="min-h-screen flex flex-col">
              <DeferredPerformanceMonitor />
              <DeferredHeartbeat />
              <DeferredBadgeClearer />
              <DeferredNotificationPrompt />
              <DeferredSwUpdateHandler />
              <DeferredLocaleMismatchBanner />
              <DeferredInstallAppBanner />
              <SiteHeader />
              <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>
              <DeferredMiniPlayer />
              <MobileBottomNav />
              <DeferredUploadFAB />
              <GlobalFooter />
              <DeferredGodModeIndicator />
            </div>
          </ScrollRestorationProvider>
        </ThemeProvider>
      </QueryProvider>
    </ProgressiveIntlProvider>
  );
}
