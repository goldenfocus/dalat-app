"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, Plus, Camera } from "lucide-react";
import { Link } from "@/lib/i18n/routing";
import { triggerHaptic } from "@/lib/haptics";

const NAV_ITEMS = [
  {
    key: "events",
    href: "/",
    icon: Home,
    labelKey: "events",
    isCenter: false,
  },
  {
    key: "create",
    href: "/events/new",
    icon: Plus,
    labelKey: "create",
    isCenter: true,
  },
  {
    key: "moments",
    href: "/moments",
    icon: Camera,
    labelKey: "moments",
    isCenter: false,
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const normalizedPath = normalizePath(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-between px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/"
            ? normalizedPath === "/"
            : normalizedPath.startsWith(item.href);
          const Icon = item.icon;
          const label = item.labelKey === "create"
            ? tCommon("create")
            : tNav(item.labelKey);

          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              onClick={() => triggerHaptic("selection")}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${
                item.isCenter
                  ? "bg-primary text-primary-foreground shadow-lg -mt-6 h-12 w-12"
                  : isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
