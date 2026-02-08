import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "@/lib/constants";

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
  metadataBase: new URL(SITE_URL),
  title: `Da Lat Events, Festivals & Things to Do | ${SITE_NAME}`,
  description:
    "Discover events happening in Da Lat this week. Live music, markets, festivals, and community gatherings in Vietnam's highland city. Free event discovery.",
  keywords: [
    "Da Lat events",
    "Dalat things to do",
    "Vietnam events",
    "Da Lat festivals",
    "what to do in Dalat",
    "Đà Lạt",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  // Optimized OG tags for faster HTML rendering
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "Da Lat Events, Festivals & Things to Do",
    description:
      "Discover events happening in Da Lat this week. Live music, markets, festivals, and community gatherings in Vietnam's highland city.",
    images: [
      {
        url: DEFAULT_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} - Events, Festivals & Things to Do in Da Lat, Vietnam`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Da Lat Events, Festivals & Things to Do | ${SITE_NAME}`,
    description:
      "Discover events happening in Da Lat this week. Live music, markets, festivals, and community gatherings in Vietnam's highland city.",
    images: [DEFAULT_OG_IMAGE],
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
