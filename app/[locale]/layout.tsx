import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { BadgeClearer } from "@/components/badge-clearer";
import { NotificationPrompt } from "@/components/notification-prompt";
import { SwUpdateHandler } from "@/components/sw-update-handler";
import { LocaleMismatchBanner } from "@/components/locale-mismatch-banner";
import { InstallAppBanner } from "@/components/pwa";
import { GlobalFooter } from "@/components/global-footer";
import { ScrollRestorationProvider } from "@/lib/contexts/scroll-restoration-context";
import { PerformanceMonitor } from "@/components/performance-monitor";
import { routing, type Locale } from "@/lib/i18n/routing";
import { CLIENT_NAMESPACES } from "@/lib/i18n/client-namespaces";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { GodModeIndicatorWrapper } from "@/components/god-mode-indicator";
import { QueryProvider } from "@/lib/providers/query-provider";
import { LocalePreloader } from "@/components/locale-preloader";
import { UploadFAB } from "@/components/moments/upload-fab";
import { SiteHeader } from "@/components/site-header";
import { MiniPlayer } from "@/components/audio/mini-player";
import { Heartbeat } from "@/components/heartbeat";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";

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

// Generate static params for all locales
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
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

  // Pass only the namespaces client components actually use — the full
  // messages object would be serialized into every page's RSC payload.
  // Guarded by scripts/check-client-namespaces.mjs in prebuild.
  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    CLIENT_NAMESPACES.filter((ns) => {
      if (ns in messages) return true;
      console.error(
        `[layout] client namespace "${ns}" missing from "${locale}" messages — client components using it will crash`
      );
      return false;
    }).map((ns) => [ns, messages[ns]])
  );

  return (
    <NextIntlClientProvider locale={locale} messages={clientMessages}>
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
              <PerformanceMonitor />
              <Heartbeat />
              <BadgeClearer />
              <NotificationPrompt />
              <SwUpdateHandler />
              <LocaleMismatchBanner />
              <InstallAppBanner />
              <SiteHeader />
              <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>
              <MiniPlayer />
              <MobileBottomNav />
              <UploadFAB />
              <GlobalFooter />
              <GodModeIndicatorWrapper />
            </div>
          </ScrollRestorationProvider>
        </ThemeProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
