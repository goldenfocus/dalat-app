import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { GlobalFooter } from "@/components/global-footer";
import { ScrollRestorationProvider } from "@/lib/contexts/scroll-restoration-context";
import { routing, type Locale } from "@/lib/i18n/routing";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import { getEffectiveUser } from "@/lib/god-mode";
import { QueryProvider } from "@/lib/providers/query-provider";

// Defer non-critical client components to reduce initial bundle
const BadgeClearer = dynamic(() => import("@/components/badge-clearer").then(m => ({ default: m.BadgeClearer })), { ssr: false });
const NotificationPrompt = dynamic(() => import("@/components/notification-prompt").then(m => ({ default: m.NotificationPrompt })), { ssr: false });
const SwUpdateHandler = dynamic(() => import("@/components/sw-update-handler").then(m => ({ default: m.SwUpdateHandler })), { ssr: false });
const LocaleMismatchBanner = dynamic(() => import("@/components/locale-mismatch-banner").then(m => ({ default: m.LocaleMismatchBanner })), { ssr: false });
const PerformanceMonitor = dynamic(() => import("@/components/performance-monitor").then(m => ({ default: m.PerformanceMonitor })), { ssr: false });
const GodModeIndicator = dynamic(() => import("@/components/god-mode-indicator").then(m => ({ default: m.GodModeIndicator })), { ssr: false });

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

  // Check God mode state
  const { godMode } = await getEffectiveUser();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ScrollRestorationProvider>
            <div className="min-h-screen flex flex-col">
              <PerformanceMonitor />
              <BadgeClearer />
              <NotificationPrompt />
              <SwUpdateHandler />
              <LocaleMismatchBanner />
              <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
                {children}
              </main>
              <MobileBottomNav />
              <GlobalFooter />
              {godMode.isActive && godMode.targetProfile && (
                <GodModeIndicator targetProfile={godMode.targetProfile} />
              )}
            </div>
          </ScrollRestorationProvider>
        </ThemeProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
