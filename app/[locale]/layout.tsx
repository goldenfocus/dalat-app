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
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { GodModeIndicatorWrapper } from "@/components/god-mode-indicator";
import { QueryProvider } from "@/lib/providers/query-provider";
import { LocalePreloader } from "@/components/locale-preloader";
import { UploadFAB } from "@/components/moments/upload-fab";
import { SiteHeader } from "@/components/site-header";
import { MiniPlayer } from "@/components/audio/mini-player";
import { Toaster } from "sonner";

const siteUrl = "https://dalat.app";

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
        // The Global Twelve
        'en': `${siteUrl}/en`,
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
        'x-default': `${siteUrl}/en`,
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

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
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
              richColors
              closeButton
              toastOptions={{
                className: "font-sans",
              }}
            />
            <LocalePreloader />
            <div className="min-h-screen flex flex-col">
              <PerformanceMonitor />
              <BadgeClearer />
              <NotificationPrompt />
              <SwUpdateHandler />
              <LocaleMismatchBanner />
              <InstallAppBanner />
              <SiteHeader />
              <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
                {children}
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
