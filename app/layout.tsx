import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const siteUrl = "https://dalat.app";

// Viewport configuration for optimal mobile rendering and PageSpeed
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ĐàLạt.app · Events · People · Moments",
  description: "Discover and organize events in Đà Lạt",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ĐàLạt.app",
  },
  formatDetection: {
    telephone: false,
  },
  // Optimized OG tags for faster HTML rendering
  openGraph: {
    type: "website",
    siteName: "ĐàLạt.app",
    url: siteUrl,
    title: "ĐàLạt.app · Events · People · Moments",
    description: "Discover and organize events in Đà Lạt",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "ĐàLạt.app · Events · People · Moments · Love",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ĐàLạt.app · Events · People · Moments",
    description: "Discover and organize events in Đà Lạt",
    images: [`${siteUrl}/og-image.png`],
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "optional", // Faster first render, fallback if font not loaded quickly
  subsets: ["latin"],
  preload: true,
  adjustFontFallback: true, // Reduce CLS with better fallback metrics
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Critical resource hints for faster connections */}
        <link
          rel="preconnect"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
        />
        {/* Preconnect to Google Fonts for Geist */}
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Apple touch icon for iOS home screen */}
        <link rel="apple-touch-icon" href="/android-chrome-192x192.png" />
      </head>
      <body className={`${geistSans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
