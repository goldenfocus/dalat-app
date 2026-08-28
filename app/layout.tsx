import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = "https://dalat.app";
const localeBootstrapScript = `
  (() => {
    const supported = new Set(['en','vi','ko','zh','ru','fr','ja','ms','th','de','es','id']);
    const locale = location.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    document.documentElement.lang = supported.has(locale) ? locale : 'en';
  })();
`;

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
  title: "Da Lat Events, Festivals & Things to Do | ĐàLạt.app",
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
    title: "Da Lat Events, Festivals & Things to Do",
    description:
      "Discover events happening in Da Lat this week. Live music, markets, festivals, and community gatherings in Vietnam's highland city.",
    images: [
      {
        url: `${siteUrl}/og-image.png?v=2`,
        width: 1200,
        height: 630,
        alt: "ĐàLạt.app - Events, Festivals & Things to Do in Da Lat, Vietnam",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Da Lat Events, Festivals & Things to Do | ĐàLạt.app",
    description:
      "Discover events happening in Da Lat this week. Live music, markets, festivals, and community gatherings in Vietnam's highland city.",
    images: [`${siteUrl}/og-image.png?v=2`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="und" suppressHydrationWarning>
      <head>
        {/* Keep static rendering while declaring the URL locale before body content parses. */}
        <script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} />
        {/* Critical resource hints for faster connections */}
        <link
          rel="preconnect"
          href="https://cdn.dalat.app"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://cdn.dalat.app" />
        <link
          rel="preconnect"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
        />
        {/* Apple touch icon for iOS home screen */}
        <link rel="apple-touch-icon" href="/android-chrome-192x192.png" />
      </head>
      {/* System font stack via globals.css — zero webfont bytes, faster FCP */}
      <body className="antialiased">{children}</body>
    </html>
  );
}
