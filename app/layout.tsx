import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { BadgeClearer } from "@/components/badge-clearer";
import { NotificationPrompt } from "@/components/notification-prompt";
import { SwUpdateHandler } from "@/components/sw-update-handler";
import "./globals.css";

const siteUrl = "https://dalat.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "dalat.app - Events without the noise",
  description: "Discover and organize events in Da Lat",
  openGraph: {
    type: "website",
    siteName: "dalat.app",
  },
  twitter: {
    card: "summary_large_image",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <BadgeClearer />
            <NotificationPrompt />
            <SwUpdateHandler />
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
