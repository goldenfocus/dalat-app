"use client";
import { isExperienceEditorPath } from "@/lib/experiences/navigation";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ellipsis, House } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { triggerHaptic } from "@/lib/haptics";
import { useViewportBottom } from "@/lib/hooks/use-viewport-bottom";
import { cityLinks, isSectionActive } from "./secondary-links";

const PRIMARY_ITEMS = [
  ...cityLinks.filter(({ key }) => key === "map" || key === "calendar"),
  { key: "rentals", href: "/rentals", icon: House },
] as const;
const MORE_ITEMS = cityLinks.filter(({ key }) => key !== "map" && key !== "calendar");

const tabClass = (active: boolean) =>
  `fog-cap flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-center leading-tight transition-colors active:scale-95 ${
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  }`;

function NavRow({
  normalizedPath,
  tNav,
  rentalsLabel,
}: {
  normalizedPath: string;
  tNav: ReturnType<typeof useTranslations>;
  rentalsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const moreActive = MORE_ITEMS.some(({ href }) => isSectionActive(normalizedPath, href));

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
              const isActive = isSectionActive(normalizedPath, item.href);
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
                    {tNav(item.key)}
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
          const isActive = isSectionActive(normalizedPath, item.href);
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
              {item.key === "rentals" ? rentalsLabel : tNav(item.key)}
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

export function MobileBottomNav({ rentalsLabel }: { rentalsLabel: string }) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const normalizedPath = normalizePath(pathname ?? "/");
  const navRef = useRef<HTMLElement>(null);
  const hidden = isExperienceEditorPath(pathname ?? "");
  useViewportBottom(navRef, !hidden);

  if (hidden) {
    return null;
  }

  return (
    // Pinned to the visible viewport's bottom edge. Deliberately no backdrop
    // blur or transform: on iOS either one makes WebKit
    // re-composite the bar while the address bar collapses mid-scroll, which
    // reads as the bar jumping. Height is fixed (4rem + safe area), never vh.
    <nav
      ref={navRef}
      data-floating-chrome="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label={tNav("primary")}
    >
      <NavRow normalizedPath={normalizedPath} tNav={tNav} rentalsLabel={rentalsLabel} />
    </nav>
  );
}
