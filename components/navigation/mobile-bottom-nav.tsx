"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, Calendar, MapPin, Newspaper, Film, Activity, Trophy } from "lucide-react";
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

function normalizePath(pathname: string) {
  return pathname.replace(/^\/[a-z]{2}(\/|$)/, "/") || "/";
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const normalizedPath = normalizePath(pathname ?? "/");

  // Hide nav on moments (fullscreen experience)
  if (normalizedPath === "/moments") {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = normalizedPath.startsWith(item.href);
          const label = tNav(item.labelKey);

          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              onClick={() => triggerHaptic("selection")}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${
                isActive
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
