"use client";
import { isExperienceEditorPath } from "@/lib/experiences/navigation";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  Calendar,
  Ellipsis,
  MapPin,
  Newspaper,
  Film,
  Activity,
  Trophy,
} from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { triggerHaptic } from "@/lib/haptics";

const NAV_ITEMS = [
  {
    key: "map",
    href: "/map",
    icon: MapPin,
    labelKey: "map",
  },
  {
    key: "calendar",
    href: "/calendar",
    icon: Calendar,
    labelKey: "calendar",
  },
  {
    key: "venues",
    href: "/venues",
    icon: Building2,
    labelKey: "venues",
  },
  {
    key: "news",
    href: "/news",
    icon: Newspaper,
    labelKey: "news",
  },
  {
    key: "loyalty",
    href: "/loyalty",
    icon: Trophy,
    labelKey: "loyalty",
  },
  {
    key: "activity",
    href: "/activity",
    icon: Activity,
    labelKey: "activity",
  },
  {
    key: "moments",
    href: "/moments",
    icon: Film,
    labelKey: "moments",
  },
];

// These three stay on the bar; the rest live under "More".
const PRIMARY_KEYS = ["map", "calendar", "news"];
const PRIMARY_ITEMS = NAV_ITEMS.filter((item) => PRIMARY_KEYS.includes(item.key));
const MORE_ITEMS = NAV_ITEMS.filter((item) => !PRIMARY_KEYS.includes(item.key));

const tabClass = (active: boolean) =>
  `fog-cap flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-colors active:scale-95 ${
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

function NavRow({
  normalizedPath,
  tNav,
}: {
  normalizedPath: string;
  tNav: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const moreActive = MORE_ITEMS.some((item) => normalizedPath.startsWith(item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      {open && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={tNav("closeMenu")}
            className="fixed inset-0 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <ul
            id="bottom-nav-more"
            className="absolute inset-x-0 bottom-full border-t border-border/60 bg-background px-4 py-2 fog-shadow"
          >
            {MORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = normalizedPath.startsWith(item.href);
              return (
                <li key={item.key} className="mx-auto max-w-md">
                  <Link
                    href={item.href}
                    prefetch={false}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      triggerHaptic("selection");
                      setOpen(false);
                    }}
                    className={`flex min-h-12 items-center gap-3 px-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {tNav(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="relative mx-auto flex h-16 max-w-md items-stretch bg-background px-2">
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = normalizedPath.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                triggerHaptic("selection");
                setOpen(false);
              }}
              className={tabClass(isActive)}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} aria-hidden="true" />
              {tNav(item.labelKey)}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="bottom-nav-more"
          onClick={() => {
            triggerHaptic("selection");
            setOpen((value) => !value);
          }}
          className={tabClass(moreActive || open)}
        >
          <Ellipsis className={`h-5 w-5 ${moreActive || open ? "stroke-[2.5]" : ""}`} aria-hidden="true" />
          {tNav("more")}
        </button>
      </div>
    </div>
  );
}

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const normalizedPath = normalizePath(pathname ?? "/");

  // Hide nav on moments (fullscreen experience)
  if (normalizedPath === "/moments" || isExperienceEditorPath(pathname ?? "")) {
    return null;
  }

  return (
    // Pinned to the layout viewport's bottom edge. Deliberately no backdrop
    // blur or transform: on iOS either one makes WebKit
    // re-composite the bar while the address bar collapses mid-scroll, which
    // reads as the bar jumping. Height is fixed (4rem + safe area), never vh.
    <nav
      data-floating-chrome="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={tNav("primary")}
    >
      <NavRow normalizedPath={normalizedPath} tNav={tNav} />
    </nav>
  );
}
