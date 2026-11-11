"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  PREVIEW_FLAG,
  parsePreviewPath,
  splitLocale,
  withChannel,
} from "@/lib/preview-channel";

function activeChannel(): string | null {
  try {
    return sessionStorage.getItem(PREVIEW_FLAG);
  } catch {
    return null;
  }
}

/**
 * Keeps a preview tab under its channel prefix (/v3/…) while the visitor
 * browses. Does nothing in a normal tab.
 *
 * Links and router calls across the app point at plain paths, so the router
 * keeps working with those. After each history update this puts the address
 * bar back under the prefix with the browser's own replaceState, which the
 * router does not observe: the URL is shareable and reload-safe (middleware
 * rewrites it), and pathname checks elsewhere in the app are unaffected.
 */
export function PreviewChannel() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const channel = activeChannel();
    if (!channel) return;

    const nativeReplace = History.prototype.replaceState;
    const fix = () => {
      const { pathname: current, search, hash } = window.location;
      if (parsePreviewPath(current)) return;
      // The homepage is handled below: the preview has its own.
      if (splitLocale(current).rest === "/") return;
      nativeReplace.call(
        window.history,
        window.history.state,
        "",
        `${withChannel(current, channel)}${search}${hash}`,
      );
    };

    const wrap = (name: "pushState" | "replaceState") => {
      const inner = window.history[name];
      const wrapped: typeof inner = function (this: History, ...args) {
        inner.apply(this, args);
        fix();
      };
      window.history[name] = wrapped;
      return () => {
        // Someone may have wrapped ours since; only unwind when still on top.
        if (window.history[name] === wrapped) window.history[name] = inner;
      };
    };

    const undoPush = wrap("pushState");
    const undoReplace = wrap("replaceState");
    fix();
    return () => {
      undoPush();
      undoReplace();
    };
  }, []);

  // Inside a preview tab the plain homepage leads to the preview homepage.
  useEffect(() => {
    const channel = activeChannel();
    if (!channel || !pathname) return;
    const { locale, rest } = splitLocale(pathname);
    if (rest === "/") router.replace(`${locale}/${channel}`);
  }, [pathname, router]);

  return null;
}
