/**
 * In-app browser (WebView) detection.
 *
 * Links shared through messaging apps open in an embedded WebView, not the
 * user's real browser. WebViews routinely lack a download manager, so
 * blob/`a[download]` saving silently no-ops there. We can't feature-detect
 * that failure (nothing throws — nothing happens), so we detect the browser
 * and show an "open in browser" hint up front.
 *
 * Zalo matters most here: it's the dominant messenger in Vietnam and the
 * source of the original "I can't save the photos" reports.
 */

const IN_APP_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "Zalo", re: /\bZalo\b/i },
  { name: "Messenger", re: /\bFB(AN|AV|_IAB)\b|FBAN|FBAV/i },
  { name: "Instagram", re: /\bInstagram\b/i },
  { name: "Line", re: /\bLine\//i },
  { name: "WeChat", re: /\bMicroMessenger\b/i },
  { name: "TikTok", re: /\bBytedanceWebview\b|\bmusical_ly\b|\bTikTok\b/i },
  { name: "Telegram", re: /\bTelegram\b/i },
  { name: "Twitter", re: /\bTwitter\b/i },
  { name: "Snapchat", re: /\bSnapchat\b/i },
];

export interface InAppBrowserInfo {
  isInApp: boolean;
  /** Human-readable app name, when we recognise it. */
  name: string | null;
  isIOS: boolean;
  isAndroid: boolean;
}

export function detectInAppBrowser(userAgent?: string): InAppBrowserInfo {
  const ua =
    userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  for (const { name, re } of IN_APP_PATTERNS) {
    if (re.test(ua)) return { isInApp: true, name, isIOS, isAndroid };
  }

  // Generic Android WebView: has "wv" in the UA, or Version/x.x alongside Chrome.
  if (isAndroid && /\bwv\b/.test(ua)) {
    return { isInApp: true, name: null, isIOS, isAndroid };
  }

  return { isInApp: false, name: null, isIOS, isAndroid };
}
