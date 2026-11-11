"use client";

import { useEffect } from "react";

/**
 * Turns the Fog Hour skin on for this tab once /v3 has been opened.
 *
 * The inline bootstrap in app/layout.tsx covers full page loads (no flash);
 * this covers arriving by client navigation, and sets the per-tab flag that
 * keeps the skin on while browsing the rest of the app. Closing the tab ends
 * the preview.
 */
export function FogMode() {
  useEffect(() => {
    document.documentElement.classList.add("fog");
    try {
      sessionStorage.setItem("fog-preview", "1");
    } catch {
      // Storage can be blocked; the skin still applies on /v3 itself.
    }
  }, []);

  return null;
}
