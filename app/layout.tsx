import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const siteUrl = "https://dalat.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ĐàLạt.app · Events · People · Moments · Love",
  description: "Discover and organize events in Đà Lạt",
  openGraph: {
    type: "website",
    siteName: "ĐàLạt.app",
    title: "ĐàLạt.app · Events · People · Moments · Love",
    description: "Discover and organize events in Đà Lạt",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "ĐàLạt.app · Events · People · Moments · Love",
    description: "Discover and organize events in Đà Lạt",
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
    <html suppressHydrationWarning>
      <head>
        {/* Resource hints for faster connections to critical domains */}
        <link
          rel="preconnect"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
        />
        <link
          rel="dns-prefetch"
          href="https://aljcmodwjqlznzcydyor.supabase.co"
        />
      </head>
      <body className={`${geistSans.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
