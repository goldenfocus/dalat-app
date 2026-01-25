"use client";

import { useState, useEffect } from "react";

export type InAppBrowserType =
  | "facebook"
  | "messenger"
  | "instagram"
  | "zalo"
  | "line"
  | "tiktok"
  | "twitter"
  | "snapchat"
  | "linkedin"
  | "pinterest"
  | "wechat"
  | "webview"
  | null;

interface UseInAppBrowserReturn {
  isInAppBrowser: boolean;
  browserType: InAppBrowserType;
  openInExternalBrowser: () => Promise<boolean>;
}

// User-agent patterns for in-app browsers
// Order matters - more specific patterns should come first
const IN_APP_BROWSER_PATTERNS: Array<{
  pattern: RegExp;
  type: InAppBrowserType;
}> = [
  // Facebook family (most common for this use case)
  { pattern: /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i, type: "facebook" },
  { pattern: /\[FB/i, type: "facebook" },
  { pattern: /Messenger/i, type: "messenger" },
  { pattern: /Instagram/i, type: "instagram" },

  // Asian messaging apps (popular in Vietnam)
  { pattern: /Zalo/i, type: "zalo" },
  { pattern: /Line\//i, type: "line" },
  { pattern: /MicroMessenger|WeChat/i, type: "wechat" },

  // Other social apps
  { pattern: /Twitter/i, type: "twitter" },
  { pattern: /BytedanceWebview|TikTok/i, type: "tiktok" },
  { pattern: /Snapchat/i, type: "snapchat" },
  { pattern: /LinkedIn/i, type: "linkedin" },
  { pattern: /Pinterest/i, type: "pinterest" },

  // Generic WebView detection (Android) - check last
  { pattern: /; wv\)/i, type: "webview" },
  // iOS WebView: has AppleWebKit and Mobile but NOT Safari
  { pattern: /AppleWebKit.*Mobile(?!.*Safari)/i, type: "webview" },
];

function detectInAppBrowser(userAgent: string): InAppBrowserType {
  for (const { pattern, type } of IN_APP_BROWSER_PATTERNS) {
    if (pattern.test(userAgent)) {
      return type;
    }
  }

  return null;
}

export function useInAppBrowser(): UseInAppBrowserReturn {
  const [browserType, setBrowserType] = useState<InAppBrowserType>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const detected = detectInAppBrowser(navigator.userAgent);
    setBrowserType(detected);
  }, []);

  const openInExternalBrowser = async (): Promise<boolean> => {
    const currentUrl = window.location.href;

    // Try native share first (iOS and Android)
    // This gives users the option to "Open in Safari" / "Open in Chrome"
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          url: currentUrl,
        });
        return true;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    // Fallback: copy link to clipboard
    try {
      await navigator.clipboard.writeText(currentUrl);
      return true;
    } catch {
      // Clipboard also failed
      return false;
    }
  };

  return {
    isInAppBrowser: browserType !== null,
    browserType,
    openInExternalBrowser,
  };
}

// Export app names for UI display
export const BROWSER_DISPLAY_NAMES: Record<
  NonNullable<InAppBrowserType>,
  string
> = {
  facebook: "Facebook",
  messenger: "Messenger",
  instagram: "Instagram",
  zalo: "Zalo",
  line: "LINE",
  tiktok: "TikTok",
  twitter: "Twitter",
  snapchat: "Snapchat",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  wechat: "WeChat",
  webview: "app",
};
