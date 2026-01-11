import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { BadgeClearer } from "@/components/badge-clearer";
import { NotificationPrompt } from "@/components/notification-prompt";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <BadgeClearer />
          <NotificationPrompt />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
